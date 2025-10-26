import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { recordingDB } from '../utils/recordingDB';
import type { RecordingData } from '../utils/recordingDB';
import { uploadRecordingToBackend } from '../utils/uploadRecording';
import './VideoCallPage.css';

const ICE_SERVERS = [
  { urls: 'stun:stun.cloudflare.com:3478' }
];

// Recording retention period (7 days in milliseconds)
const RECORDING_RETENTION_DAYS = 7;
const RECORDING_RETENTION_MS = RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function VideoCallPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room');

  const [isConnected, setIsConnected] = useState(false);
  const [isCallStarted, setIsCallStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteUserName, setRemoteUserName] = useState<string | null>(null);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [remoteVideoResolution, setRemoteVideoResolution] = useState<string>('');

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [sessionId, setSessionId] = useState<string>('');
  const [recordingPartNumber, setRecordingPartNumber] = useState(0);

  // Separate recorders for local and remote streams
  const localMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const remoteMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const localRecordedChunksRef = useRef<Blob[]>([]);
  const remoteRecordedChunksRef = useRef<Blob[]>([]);

  const recordingStartTimeRef = useRef<number>(0);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingAutoStopTimerRef = useRef<number | null>(null);

  // Maximum recording duration: 10 minutes (for Flickr limit)
  const MAX_RECORDING_DURATION_MS = 10 * 60 * 1000; // 10 minutes in milliseconds

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const isPoliteRef = useRef(false);
  const waitingBeepIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Play a beep sound using Web Audio API
  const playWaitingBeep = async () => {
    try {
      if (!audioContextRef.current) {
        console.log('Creating AudioContext in playWaitingBeep');
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;

      // Resume AudioContext if it's suspended (required by browser autoplay policy)
      if (ctx.state === 'suspended') {
        console.log('AudioContext is suspended, resuming...');
        await ctx.resume();
        console.log('AudioContext resumed, new state:', ctx.state);
      }

      console.log('Playing beep, AudioContext state:', ctx.state);

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Configure beep sound: 800Hz, 0.2 seconds
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.2);

      console.log('Beep played');
    } catch (error) {
      console.error('Failed to play beep:', error);
    }
  };

  // Start waiting beep interval
  const startWaitingBeep = () => {
    if (waitingBeepIntervalRef.current) return;

    // Play immediately
    playWaitingBeep();

    // Then play every 3 seconds
    waitingBeepIntervalRef.current = window.setInterval(() => {
      playWaitingBeep();
    }, 3000);
  };

  // Stop waiting beep interval
  const stopWaitingBeep = () => {
    if (waitingBeepIntervalRef.current) {
      clearInterval(waitingBeepIntervalRef.current);
      waitingBeepIntervalRef.current = null;
    }
  };

  useEffect(() => {
    if (!user || !roomId) {
      navigate('/');
      return;
    }

    // Disable scrolling on mobile
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    initializeCall();

    return () => {
      // Re-enable scrolling when leaving
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
      stopWaitingBeep();
      cleanup();
    };
  }, [user, roomId, navigate]);

  // Handle waiting beep based on connection state
  useEffect(() => {
    console.log('Beep effect triggered - isConnected:', isConnected, 'hasRemoteStream:', hasRemoteStream);

    if (isConnected && !hasRemoteStream) {
      // Start beep when waiting for remote user
      console.log('Starting waiting beep (no remote stream)');

      // Initialize AudioContext if needed (must be done in response to user gesture)
      if (!audioContextRef.current) {
        console.log('Creating AudioContext');
        try {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          console.log('AudioContext created, state:', audioContextRef.current.state);
        } catch (error) {
          console.error('Failed to create AudioContext:', error);
        }
      }

      startWaitingBeep();
    } else {
      // Stop beep when remote user connects or disconnected
      console.log('Stopping waiting beep');
      stopWaitingBeep();
    }

    return () => {
      stopWaitingBeep();
    };
  }, [isConnected, hasRemoteStream]);

  const initializeCall = async () => {
    try {
      // Get local media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Connect to signaling server
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/webrtc/${roomId}?userId=${user!.userId}&userName=${encodeURIComponent(user!.userName)}&roomId=${roomId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);

        // Generate session ID for this call (room-based)
        const newSessionId = `${roomId}-${Date.now()}`;
        setSessionId(newSessionId);
        console.log('Session ID:', newSessionId);
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        await handleSignalingMessage(data);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setError('Failed to connect to signaling server');
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setIsConnected(false);
      };
    } catch (err) {
      console.error('Failed to initialize call:', err);
      setError('Failed to access camera/microphone');
    }
  };

  const handleSignalingMessage = async (data: any) => {
    console.log('Signaling message:', data);

    switch (data.type) {
      case 'participants':
        // Other user joined before us
        if (data.participants && data.participants.length > 0) {
          const remote = data.participants[0];
          setRemoteUserName(remote.userName);
          // Determine who is polite based on user ID comparison
          isPoliteRef.current = user!.userId > remote.userId;
          console.log('I am', isPoliteRef.current ? 'polite' : 'impolite');
          await startCall(true); // We initiate
        }
        break;

      case 'join':
        // New user joined
        if (data.from) {
          console.log('User joined:', data.from);

          // If we already have a connection, close it and start fresh
          if (peerConnectionRef.current) {
            console.log('Closing existing peer connection for reconnection');
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
            setIsCallStarted(false);
            setHasRemoteStream(false);
          }

          // Determine who is polite based on user ID comparison
          isPoliteRef.current = user!.userId > data.from;
          console.log('I am', isPoliteRef.current ? 'polite' : 'impolite');

          // Only impolite peer initiates the offer
          if (!isPoliteRef.current) {
            await startCall(true);
          } else {
            await startCall(false); // Just prepare connection, wait for offer
          }
        }
        break;

      case 'offer':
        await handleOffer(data);
        break;

      case 'answer':
        await handleAnswer(data);
        break;

      case 'ice-candidate':
        await handleIceCandidate(data);
        break;

      case 'leave':
        handleLeave();
        break;

      case 'room-count-update':
        if (data.count !== undefined) {
          const newCount = data.count;
          console.log('Participant count updated:', newCount);

          // Check if PC (not mobile)
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

          // Check if auto-recording is enabled
          const autoRecordingEnabled = localStorage.getItem('autoRecordingEnabled') === 'true';

          // Auto-start recording when 2 people join (PC only and if auto-recording enabled)
          if (!isMobile && autoRecordingEnabled && newCount === 2 && !isRecording) {
            console.log('Auto-starting recording (2 participants detected, PC device, auto-recording enabled)');
            setRecordingPartNumber(0); // Reset part number for new recording session
            startRecording();
          }

          // Stop recording when participant count drops below 2
          if (newCount < 2 && isRecording) {
            console.log('Stopping recording (participant count < 2)');
            stopRecording();
            setRecordingPartNumber(0); // Reset part number when stopping
          }
        }
        break;
    }
  };

  const startCall = async (shouldCreateOffer: boolean) => {
    console.log('Starting call, shouldCreateOffer:', shouldCreateOffer);

    setIsCallStarted(true);

    // Create peer connection
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionRef.current = pc;

    // Add local stream to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('Remote track received:', event);
      console.log('Remote streams:', event.streams);
      console.log('Remote video ref:', remoteVideoRef.current);
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0];
        console.log('Setting remote stream to video element');
        console.log('Stream tracks:', stream.getTracks());
        console.log('Video tracks:', stream.getVideoTracks());
        console.log('Audio tracks:', stream.getAudioTracks());

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          console.log('Remote video srcObject set:', remoteVideoRef.current.srcObject);

          // Force play
          remoteVideoRef.current.play().then(() => {
            console.log('Remote video playing');
            console.log('Video paused?', remoteVideoRef.current!.paused);
            console.log('Video readyState:', remoteVideoRef.current!.readyState);
            setHasRemoteStream(true);

            // Get video track settings to determine resolution
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
              const settings = videoTrack.getSettings();
              console.log('Remote video settings:', settings);
              if (settings.width && settings.height) {
                const resolution = `${settings.width}x${settings.height}`;
                const aspectRatio = settings.width / settings.height;
                console.log('Remote resolution:', resolution);
                console.log('Remote aspect ratio:', aspectRatio);
                setRemoteVideoResolution(`${resolution} (${aspectRatio.toFixed(2)})`);

                // Adjust local video element's object-fit based on remote aspect ratio
                if (remoteVideoRef.current) {
                  // Use contain to preserve aspect ratio and show black bars if needed
                  remoteVideoRef.current.style.objectFit = 'contain';
                }
              }
            }
          }).catch((err) => {
            console.error('Failed to play remote video:', err);
          });
        } else {
          console.error('Remote video ref is null');
        }
      } else {
        console.error('No streams in track event');
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate.toJSON(),
        }));
      }
    };

    // Only create offer if we should
    if (shouldCreateOffer) {
      console.log('Creating offer...');
      makingOfferRef.current = true;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'offer',
            sdp: pc.localDescription!.toJSON(),
          }));
        }
      } finally {
        makingOfferRef.current = false;
      }
    }
  };

  const handleOffer = async (data: any) => {
    console.log('Handling offer from', data.from);

    const pc = peerConnectionRef.current;
    if (!pc) {
      console.error('No peer connection when receiving offer');
      return;
    }

    // Check for collision
    const offerCollision = pc.signalingState !== 'stable' || makingOfferRef.current;

    ignoreOfferRef.current = !isPoliteRef.current && offerCollision;
    if (ignoreOfferRef.current) {
      console.log('Ignoring offer due to collision (impolite peer)');
      return;
    }

    try {
      // Set remote description
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'answer',
          sdp: pc.localDescription!.toJSON(),
        }));
      }

      setIsCallStarted(true);
    } catch (err) {
      console.error('Error handling offer:', err);
    }
  };

  const handleAnswer = async (data: any) => {
    console.log('Handling answer from', data.from);
    const pc = peerConnectionRef.current;
    if (!pc) {
      console.error('No peer connection when receiving answer');
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      console.log('Remote description set successfully');
    } catch (err) {
      console.error('Error handling answer:', err);
    }
  };

  const handleIceCandidate = async (data: any) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  };

  const handleLeave = () => {
    console.log('Remote user left, cleaning up...');
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    // Close and cleanup peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    setIsCallStarted(false);
    setHasRemoteStream(false);
    setRemoteUserName(null);
    setRemoteVideoResolution('');

    console.log('Cleanup complete, ready for new connection');
  };

  // Start recording (separate local and remote)
  const startRecording = async () => {
    try {
      // Check if mobile (exclude mobile from recording)
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        console.log('Recording not supported on mobile devices');
        return;
      }

      console.log('Starting recording (local and remote separately)...');

      const options = { mimeType: 'video/webm;codecs=vp9,opus' };

      // Record local stream
      if (localStreamRef.current) {
        // Check tracks in local stream
        const videoTracks = localStreamRef.current.getVideoTracks();
        const audioTracks = localStreamRef.current.getAudioTracks();
        console.log(`[Local] Video tracks: ${videoTracks.length}, Audio tracks: ${audioTracks.length}`);
        videoTracks.forEach((track, i) => console.log(`  Video ${i}: ${track.label} (enabled: ${track.enabled})`));
        audioTracks.forEach((track, i) => console.log(`  Audio ${i}: ${track.label} (enabled: ${track.enabled})`));

        const localRecorder = new MediaRecorder(localStreamRef.current, options);
        localMediaRecorderRef.current = localRecorder;
        localRecordedChunksRef.current = [];

        localRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            localRecordedChunksRef.current.push(event.data);
          }
        };

        localRecorder.onstop = async () => {
          console.log('Local recording stopped, processing...');
          await saveRecording('local');
        };

        localRecorder.start(1000);
        console.log('Local recording started');
      }

      // Record remote stream
      if (peerConnectionRef.current) {
        const receivers = peerConnectionRef.current.getReceivers();
        const remoteStream = new MediaStream();
        receivers.forEach(receiver => {
          if (receiver.track) {
            remoteStream.addTrack(receiver.track);
          }
        });

        if (remoteStream.getTracks().length > 0) {
          // Check tracks in remote stream
          const videoTracks = remoteStream.getVideoTracks();
          const audioTracks = remoteStream.getAudioTracks();
          console.log(`[Remote] Video tracks: ${videoTracks.length}, Audio tracks: ${audioTracks.length}`);
          videoTracks.forEach((track, i) => console.log(`  Video ${i}: ${track.label} (enabled: ${track.enabled})`));
          audioTracks.forEach((track, i) => console.log(`  Audio ${i}: ${track.label} (enabled: ${track.enabled})`));

          const remoteRecorder = new MediaRecorder(remoteStream, options);
          remoteMediaRecorderRef.current = remoteRecorder;
          remoteRecordedChunksRef.current = [];

          remoteRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              remoteRecordedChunksRef.current.push(event.data);
            }
          };

          remoteRecorder.onstop = async () => {
            console.log('Remote recording stopped, processing...');
            await saveRecording('remote');
          };

          remoteRecorder.start(1000);
          console.log('Remote recording started');
        }
      }

      const startTime = Date.now();
      recordingStartTimeRef.current = startTime;

      // Set session ID if not already set (use the same timestamp for consistency)
      if (!sessionId) {
        const newSessionId = `${roomId}-${startTime}`;
        setSessionId(newSessionId);
        console.log(`Created new session ID: ${newSessionId}`);
      }

      setIsRecording(true);

      // Start duration timer
      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
        setRecordingDuration(elapsed);
      }, 1000);

      // Set auto-stop timer for 10-minute limit (Flickr constraint)
      recordingAutoStopTimerRef.current = window.setTimeout(() => {
        console.log('Auto-stopping recording at 10-minute mark (Flickr limit)');
        stopRecording();

        // Auto-restart recording if call is still active
        if (hasRemoteStream && peerConnectionRef.current) {
          console.log('Auto-restarting recording for next segment...');
          setRecordingPartNumber(prev => prev + 1);
          setTimeout(() => {
            startRecording();
          }, 1000);
        }
      }, MAX_RECORDING_DURATION_MS);

      console.log(`Recording started (part ${recordingPartNumber + 1})`);
    } catch (error) {
      console.error('Failed to start recording:', error);
      setError('録画の開始に失敗しました');
    }
  };

  // Stop recording
  const stopRecording = () => {
    console.log('Stopping recording...');

    // Stop local recorder
    if (localMediaRecorderRef.current && localMediaRecorderRef.current.state !== 'inactive') {
      localMediaRecorderRef.current.stop();
    }

    // Stop remote recorder
    if (remoteMediaRecorderRef.current && remoteMediaRecorderRef.current.state !== 'inactive') {
      remoteMediaRecorderRef.current.stop();
    }

    setIsRecording(false);

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    // Clear auto-stop timer
    if (recordingAutoStopTimerRef.current) {
      clearTimeout(recordingAutoStopTimerRef.current);
      recordingAutoStopTimerRef.current = null;
    }
  };

  // Save recording to IndexedDB and upload to backend
  const saveRecording = async (type: 'local' | 'remote') => {
    try {
      // Get the appropriate chunks based on type
      const chunks = type === 'local' ? localRecordedChunksRef.current : remoteRecordedChunksRef.current;

      if (chunks.length === 0) {
        console.log(`No ${type} chunks to save`);
        return;
      }

      const blob = new Blob(chunks, { type: 'video/webm' });
      const duration = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
      // Use recordingStartTimeRef to ensure both local and remote use the same sessionId
      const currentSessionId = sessionId || `${roomId}-${recordingStartTimeRef.current}`;
      const recordingId = `${currentSessionId}-${type}-part${recordingPartNumber}`;

      console.log(`Saving ${type} recording: ${recordingId}, size: ${blob.size} bytes, duration: ${duration}s`);
      console.log(`Session ID for recording: "${currentSessionId}"`);

      // Create recording data
      const recordingData: RecordingData = {
        id: recordingId,
        sessionId: currentSessionId,
        userId: user!.userId,
        roomId: roomId || 'main-call',
        timestamp: recordingStartTimeRef.current,
        blob: blob,
        duration: duration,
        uploadStatus: 'pending',
        expiresAt: Date.now() + RECORDING_RETENTION_MS,
      };

      // Save to IndexedDB
      await recordingDB.saveRecording(recordingData);
      console.log(`${type} recording saved to IndexedDB`);

      // Upload to backend in parallel (non-blocking)
      uploadRecordingToBackend(recordingData).catch(error => {
        console.error(`${type} background upload failed:`, error);
      });

      // Reset chunks for this type
      if (type === 'local') {
        localRecordedChunksRef.current = [];
      } else {
        remoteRecordedChunksRef.current = [];
      }

      setRecordingDuration(0);
    } catch (error) {
      console.error(`Failed to save ${type} recording:`, error);
      setError('録画の保存に失敗しました');
    }
  };

  const cleanup = () => {
    // Stop recording if active
    if (isRecording) {
      stopRecording();
    }

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
    }
  };

  const handleEndCall = () => {
    cleanup();
    navigate('/');
  };

  return (
    <div className="video-call-container">
      <div className="video-call-header">
        <h2>ビデオ通話 - {roomId}</h2>
        <div className="status-container">
          {!isConnected && <span className="status-disconnected">接続中...</span>}
          {isConnected && !isCallStarted && <span className="status-waiting">待機中...</span>}
          {isConnected && isCallStarted && <span className="status-connected">接続済み</span>}
          {isRecording && (
            <span className="status-recording">
              ⏺️ 録画中 {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className={`video-grid ${hasRemoteStream ? 'full-screen-mode' : 'waiting-mode'}`}>
        {hasRemoteStream ? (
          <>
            {/* Remote video - full screen */}
            <div className="video-box remote">
              <video ref={remoteVideoRef} autoPlay playsInline />
              <div className="video-label">
                {remoteUserName || '相手'}
                {remoteVideoResolution && <span style={{ marginLeft: '0.5rem', opacity: 0.7, fontSize: '0.7rem' }}>
                  {remoteVideoResolution}
                </span>}
              </div>
            </div>

            {/* Local video - small window at bottom right */}
            <div className="video-box local">
              <video ref={localVideoRef} autoPlay muted playsInline />
              <div className="video-label">あなた</div>
            </div>
          </>
        ) : (
          <>
            {/* Waiting mode - both videos side by side */}
            <div className="video-box waiting-remote">
              <video ref={remoteVideoRef} autoPlay playsInline />
              <div className="video-label">{remoteUserName || '相手を待っています...'}</div>
            </div>

            <div className="video-box waiting-local">
              <video ref={localVideoRef} autoPlay muted playsInline />
              <div className="video-label">あなた</div>
            </div>
          </>
        )}
      </div>

      <div className="call-controls">
        <button onClick={handleEndCall} className="end-call-button">
          通話を終了
        </button>
      </div>
    </div>
  );
}
