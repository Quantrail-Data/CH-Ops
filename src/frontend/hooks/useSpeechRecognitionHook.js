// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Custom React hook wrapping the Web Speech API to manage browser-based voice transcription and microphone states.

import { useEffect, useState, useRef } from 'react'

function useSpeechRecognitionHook(onTranscript) {
    const [hasError, setHasError] = useState(false);
    const [listening, setListening] = useState(false);
    const [isMIC, setIsMIC] = useState(false);

    const RecongnitionRef = useRef(null);

    // Determine if browser supports speech recognition
    const isSupportSpeechRecongnition = () => {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    const MicrophoneWorking = async () => {
        try {
            // If Permissions API exists, use it
            if (navigator.permissions && typeof navigator.permissions.query === 'function') {
                const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
                if (permissionStatus.state === 'granted') {
                    setIsMIC(false);
                } else if (permissionStatus.state === 'denied') {
                    setIsMIC(true);
                } else {
                    setIsMIC(false);
                }
                // react to permission changes if browser supports onchange
                if (typeof permissionStatus.onchange === 'function') {
                    permissionStatus.onchange = () => {
                        setIsMIC(permissionStatus.state === 'denied');
                    };
                }
                return;
            }

            // Fallback: check for getUserMedia availability as a hint
            const hasGetUserMedia = !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
            setIsMIC(!hasGetUserMedia); // if no getUserMedia, set mic as unavailable
        } catch (err) {
            // If something goes wrong, mark error but try a reasonable fallback
            console.warn('Microphone permission check failed:', err.message);
            setHasError(true);
            const hasGetUserMedia = !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
            setIsMIC(!hasGetUserMedia);
        }
    }

    useEffect(() => {
        // Run initial microphone availability check
        MicrophoneWorking();

        const SpeechRecognition_v1 = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition_v1) {
            // Not supported; nothing else to do
            return () => {};
        }

        const recognition = new SpeechRecognition_v1();
        RecongnitionRef.current = recognition;

        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-IN';

        const handleResult = (event) => {
            let finalTranscript = '';
            try {
                const lastResult = event.results[event.results.length - 1];
                const transcript = lastResult[0].transcript || '';
                if (lastResult.isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    finalTranscript += transcript + ' ';
                }
            } catch (e) {
                console.warn('SpeechRecognition result parsing failed', e.message);
            }
            if (finalTranscript) {
                onTranscript(finalTranscript);
            }
        };

        recognition.onresult = handleResult;
        recognition.onend = () => {
            setListening(false);
        };
        recognition.onerror = (event) => {
            console.error('SpeechRecognition error:', event);
            setHasError(true);
            setListening(false);
        };

        // cleanup
        return () => {
            try {
                if (RecongnitionRef.current) {
                    RecongnitionRef.current.onresult = null;
                    RecongnitionRef.current.onend = null;
                    RecongnitionRef.current.onerror = null;
                    try {
                        RecongnitionRef.current.stop();
                    } catch (e) {
                    }
                    RecongnitionRef.current = null;
                }
            } catch (e) {
            }
        }
    }, [onTranscript]);

    // start/stop listening
    function StartlisteningHandler() {
        if (!RecongnitionRef.current) {
            setHasError(true);
            return;
        }

        if (isMIC) {
            setHasError(true);
            return;
        }

        try {
            if (!listening) {
                RecongnitionRef.current.start();
                setListening(true);
            } else {
                RecongnitionRef.current.stop();
                setListening(false);
            }
        } catch (e) {
            console.warn('Start/Stop speech recognition failed', e.message);
            setHasError(true);
            setListening(false);
        }
    }

    function StopListeningHandler() {
        if (!RecongnitionRef.current) {
            setHasError(true);
            return;
        }
        try {
            RecongnitionRef.current.stop();
            setListening(false);
        } catch (e) {
            console.warn('Stop speech recognition failed', e.message);
            setHasError(true);
        }
    }

    return { isSupportSpeechRecongnition, StartlisteningHandler, StopListeningHandler, listening, hasError, isMIC }
}

export default useSpeechRecognitionHook