#!/usr/bin/env python3
"""
Vosk ASR WebSocket Server for AI Assistant
Provides real-time speech-to-text with partial and final results
Privacy-first: all processing local, no data leaves machine

Improvements:
- Custom vocabulary/grammar support
- Robust error feedback to client
- Connection health checks with keepalive
- Multiple client edge case handling
- Proper resource management and cleanup
"""

import asyncio
import json
import os
import sys
import wave
import time
import gc
from pathlib import Path
from typing import Optional, Dict, Set

try:
    import websockets
    from vosk import Model, KaldiRecognizer
except ImportError:
    print("ERROR: Missing dependencies. Install with:")
    print("  pip install vosk websockets")
    sys.exit(1)

# Configuration - tries small model first (downloaded by npm run setup), then falls back to large
def get_model_path():
    small_model = './models/vosk-model-small-en-us-0.15'
    large_model = './models/vosk-model-en-us-0.22'
    
    # Check env variable first
    if os.getenv('VOSK_MODEL_PATH'):
        return os.getenv('VOSK_MODEL_PATH')
    
    # Prefer small model (what npm run setup downloads)
    if os.path.exists(small_model):
        return small_model
    
    # Fallback to large model
    if os.path.exists(large_model):
        return large_model
    
    # Default to small model path (will show download instructions)
    return small_model

VOSK_MODEL_PATH = get_model_path()
VOCABULARY_PATH = os.getenv('VOSK_VOCABULARY_PATH', './vocabulary.json')
SERVER_HOST = os.getenv('VOSK_HOST', 'localhost')
SERVER_PORT = int(os.getenv('VOSK_PORT', '2700'))
SAMPLE_RATE = 16000  # Vosk expects 16kHz
CHANNELS = 1  # Mono
KEEPALIVE_INTERVAL = 30  # Send keepalive every 30 seconds
CLIENT_TIMEOUT = 90  # Disconnect if no activity for 90 seconds

class VoskServer:
    def __init__(self, model_path, vocabulary_path=None):
        self.model_path = model_path
        self.vocabulary_path = vocabulary_path
        self.model = None
        self.active_connections = 0
        self.client_registry: Dict[str, Dict] = {}  # Track all connected clients
        self.custom_vocabulary = None
        
    def load_vocabulary(self):
        """Load custom vocabulary/grammar for better recognition of jargon, names, etc."""
        if not self.vocabulary_path or not os.path.exists(self.vocabulary_path):
            print(f"[INFO] No custom vocabulary file found at: {self.vocabulary_path or 'N/A'}")
            print(f"[INFO] To improve recognition of technical terms, create vocabulary.json with:")
            print(f"       {{\"words\": [\"leetcode\", \"kubernetes\", \"tensorflow\", ...]}}")
            return None
            
        try:
            with open(self.vocabulary_path, 'r', encoding='utf-8') as f:
                vocab_data = json.load(f)
                words = vocab_data.get('words', [])
                
            if words:
                # Format for Vosk: JSON array of words
                self.custom_vocabulary = json.dumps(words)
                print(f"[OK] Loaded {len(words)} custom vocabulary words")
                print(f"[INFO] Sample terms: {', '.join(words[:10])}")
                return self.custom_vocabulary
            else:
                print(f"[WARN] Vocabulary file is empty")
                return None
                
        except Exception as e:
            print(f"[ERROR] Failed to load vocabulary: {e}")
            return None
        
    def load_model(self):
        """Load Vosk model (run once at startup)"""
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(
                f"Vosk model not found at: {self.model_path}\n"
                f"Download from: https://alphacephei.com/vosk/models\n"
                f"Recommended: vosk-model-small-en-us-0.15 (~40MB, fast)\n"
                f"Extract to: {self.model_path}"
            )
        
        print(f"Loading Vosk model from: {self.model_path}")
        self.model = Model(self.model_path)
        print(f"[OK] Model loaded successfully")
        
        # Load custom vocabulary if available
        self.load_vocabulary()
        
    def create_recognizer(self):
        """Create a new recognizer instance with custom vocabulary if available"""
        recognizer = KaldiRecognizer(self.model, SAMPLE_RATE)
        recognizer.SetWords(True)  # Enable word-level timestamps
        recognizer.SetPartialWords(True)  # Enable partial results
        
        # Apply custom vocabulary/grammar if loaded
        if self.custom_vocabulary:
            try:
                recognizer.SetGrammar(self.custom_vocabulary)
                print(f"[INFO] Applied custom vocabulary to recognizer")
            except Exception as e:
                print(f"[WARN] Failed to apply vocabulary: {e}")
                
        return recognizer
    
    async def send_error(self, websocket, error_message: str, error_type: str = "error"):
        """Send error message to client for better UX/diagnostics"""
        try:
            await websocket.send(json.dumps({
                'type': 'error',
                'error_type': error_type,
                'message': error_message,
                'timestamp': time.time()
            }))
        except Exception:
            pass  # Client may have already disconnected
    
    async def keepalive_task(self, websocket, client_id: str):
        """Send periodic keepalive pings to maintain connection health"""
        try:
            while True:
                await asyncio.sleep(KEEPALIVE_INTERVAL)
                
                # Check if client is still registered
                if client_id not in self.client_registry:
                    break
                    
                # Update last activity timestamp
                client_info = self.client_registry.get(client_id)
                if client_info:
                    last_activity = client_info.get('last_activity', 0)
                    idle_time = time.time() - last_activity
                    
                    # Disconnect if client is idle for too long
                    if idle_time > CLIENT_TIMEOUT:
                        print(f"[TIMEOUT] Client {client_id} idle for {idle_time:.0f}s, disconnecting")
                        await self.send_error(websocket, f"Connection timeout after {idle_time:.0f}s idle", "timeout")
                        break
                
                # Send keepalive ping
                try:
                    await websocket.send(json.dumps({
                        'type': 'keepalive',
                        'timestamp': time.time()
                    }))
                except websockets.exceptions.ConnectionClosed:
                    break
                    
        except asyncio.CancelledError:
            pass  # Task cancelled on disconnect
        except Exception as e:
            print(f"[ERROR] Keepalive task error for {client_id}: {e}")
        
    async def handle_connection(self, websocket):
        """Handle individual WebSocket connection from Electron app"""
        client_id = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
        
        # Check for duplicate connections from same client
        if client_id in self.client_registry:
            print(f"[WARN] Duplicate connection detected from {client_id}, cleaning up old connection")
            old_info = self.client_registry[client_id]
            # Cancel old keepalive task if exists
            if old_info.get('keepalive_task'):
                old_info['keepalive_task'].cancel()
            # Clean up old recognizer
            if old_info.get('recognizer'):
                del old_info['recognizer']
                gc.collect()
        
        self.active_connections += 1
        print(f"[CONNECT] Client connected: {client_id} (total: {self.active_connections})")
        
        # Create recognizer for this connection with custom vocabulary
        recognizer = self.create_recognizer()
        
        # Register client with tracking info
        self.client_registry[client_id] = {
            'recognizer': recognizer,
            'connected_at': time.time(),
            'last_activity': time.time(),
            'keepalive_task': None
        }
        
        # Start keepalive task
        keepalive_task = asyncio.create_task(self.keepalive_task(websocket, client_id))
        self.client_registry[client_id]['keepalive_task'] = keepalive_task
        
        # Send connection success message
        await websocket.send(json.dumps({
            'type': 'connected',
            'message': 'Vosk ASR ready',
            'sample_rate': SAMPLE_RATE,
            'custom_vocabulary': self.custom_vocabulary is not None,
            'timestamp': time.time()
        }))
        
        try:
            async for message in websocket:
                # Update last activity timestamp
                if client_id in self.client_registry:
                    self.client_registry[client_id]['last_activity'] = time.time()
                
                # Message can be binary (PCM audio) or text (control)
                if isinstance(message, bytes):
                    try:
                        # Process audio chunk
                        if recognizer.AcceptWaveform(message):
                            # Final result (sentence complete)
                            result = json.loads(recognizer.Result())
                            if result.get('text'):
                                await websocket.send(json.dumps({
                                    'type': 'final',
                                    'text': result['text'],
                                    'confidence': result.get('result', [{}])[0].get('conf', 0.0) if result.get('result') else 0.0,
                                    'timestamp': time.time()
                                }))
                        else:
                            # Partial result (ongoing speech)
                            partial = json.loads(recognizer.PartialResult())
                            if partial.get('partial'):
                                await websocket.send(json.dumps({
                                    'type': 'partial',
                                    'text': partial['partial'],
                                    'timestamp': time.time()
                                }))
                    except Exception as e:
                        error_msg = f"Audio processing error: {str(e)}"
                        print(f"[ERROR] {client_id}: {error_msg}")
                        await self.send_error(websocket, error_msg, "audio_processing")
                        
                elif isinstance(message, str):
                    # Handle control messages
                    try:
                        cmd = json.loads(message)
                        if cmd.get('action') == 'reset':
                            # Reset recognizer state (new conversation)
                            # Clean up old recognizer
                            del recognizer
                            gc.collect()
                            
                            # Create new recognizer with vocabulary
                            recognizer = self.create_recognizer()
                            self.client_registry[client_id]['recognizer'] = recognizer
                            
                            await websocket.send(json.dumps({
                                'type': 'status',
                                'message': 'recognizer_reset',
                                'timestamp': time.time()
                            }))
                        elif cmd.get('action') == 'ping':
                            await websocket.send(json.dumps({
                                'type': 'pong',
                                'timestamp': time.time()
                            }))
                        elif cmd.get('type') == 'eof' or cmd.get('eof') == 1:
                            # Client signals end of utterance - finalize transcription
                            try:
                                final_result = json.loads(recognizer.FinalResult())
                                if final_result.get('text'):
                                    await websocket.send(json.dumps({
                                        'type': 'final',
                                        'text': final_result['text'],
                                        'confidence': final_result.get('result', [{}])[0].get('conf', 0.0) if final_result.get('result') else 0.0,
                                        'timestamp': time.time(),
                                        'source': 'eof_signal'
                                    }))
                                    print(f"[EOF] Finalized utterance for {client_id}: '{final_result.get('text', '')[:50]}'")
                                
                                # Reset recognizer state for next utterance
                                # Note: FinalResult() already resets the recognizer internally
                            except Exception as e:
                                print(f"[ERROR] EOF processing error for {client_id}: {e}")
                                await self.send_error(websocket, f"EOF processing error: {str(e)}", "eof_processing")
                        elif cmd.get('action') == 'update_vocabulary':
                            # Allow runtime vocabulary updates
                            new_words = cmd.get('words', [])
                            if new_words:
                                vocab_json = json.dumps(new_words)
                                recognizer.SetGrammar(vocab_json)
                                await websocket.send(json.dumps({
                                    'type': 'status',
                                    'message': f'vocabulary_updated ({len(new_words)} words)',
                                    'timestamp': time.time()
                                }))
                    except json.JSONDecodeError as e:
                        error_msg = f"Invalid JSON command: {str(e)}"
                        print(f"[ERROR] {client_id}: {error_msg}")
                        await self.send_error(websocket, error_msg, "invalid_json")
                    except Exception as e:
                        error_msg = f"Command processing error: {str(e)}"
                        print(f"[ERROR] {client_id}: {error_msg}")
                        await self.send_error(websocket, error_msg, "command_processing")
                        
        except websockets.exceptions.ConnectionClosed:
            print(f"[DISCONNECT] Client disconnected: {client_id}")
        except Exception as e:
            error_msg = f"Connection error: {str(e)}"
            print(f"[ERROR] {client_id}: {error_msg}")
            await self.send_error(websocket, error_msg, "connection_error")
        finally:
            # Cleanup: Remove from registry and free resources
            if client_id in self.client_registry:
                client_info = self.client_registry[client_id]
                
                # Cancel keepalive task
                if client_info.get('keepalive_task'):
                    client_info['keepalive_task'].cancel()
                
                # Clean up recognizer
                if client_info.get('recognizer'):
                    del client_info['recognizer']
                
                # Remove from registry
                del self.client_registry[client_id]
                
                # Force garbage collection to free memory
                gc.collect()
            
            self.active_connections -= 1
            print(f"[INFO] Active connections: {self.active_connections}")
            print(f"[INFO] Registered clients: {len(self.client_registry)}")
            
    async def start_server(self):
        """Start WebSocket server"""
        print(f"\n{'='*60}")
        print(f"Vosk ASR Server for AI Assistant")
        print(f"{'='*60}")
        print(f"Model: {self.model_path}")
        print(f"Vocabulary: {self.vocabulary_path if self.custom_vocabulary else 'None (default)'}")
        print(f"Server: ws://{SERVER_HOST}:{SERVER_PORT}")
        print(f"Audio format: {SAMPLE_RATE}Hz, {CHANNELS} channel(s), 16-bit PCM")
        print(f"Keepalive: {KEEPALIVE_INTERVAL}s interval, {CLIENT_TIMEOUT}s timeout")
        print(f"Privacy: ALL processing local, no data leaves this machine")
        print(f"{'='*60}\n")
        
        async with websockets.serve(self.handle_connection, SERVER_HOST, SERVER_PORT):
            print(f"[OK] Server listening on ws://{SERVER_HOST}:{SERVER_PORT}")
            print(f"[READY] Waiting for connections...\n")
            await asyncio.Future()  # Run forever

def main():
    """Main entry point"""
    server = VoskServer(VOSK_MODEL_PATH, VOCABULARY_PATH)
    
    try:
        server.load_model()
    except FileNotFoundError as e:
        print(f"\n[ERROR] {e}\n")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Error loading model: {e}\n")
        sys.exit(1)
    
    try:
        asyncio.run(server.start_server())
    except KeyboardInterrupt:
        print(f"\n\n[STOP] Server stopped by user")
        print(f"[INFO] Cleaning up resources...")
        gc.collect()
    except Exception as e:
        print(f"\n[ERROR] Server error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
