import { useEffect, useRef, useState } from "react";

function VoiceControl({
  startReading,
  pauseReading,
  resumeReading,
  repeatCurrentLine,
  nextLine,
  previousLine,
  stopReading,
  resetSignal = 0,
}) {
  const [isListening, setIsListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");

  const recognitionRef = useRef(null);
  const actionsRef = useRef({});

  useEffect(() => {
    actionsRef.current = {
      startReading,
      pauseReading,
      resumeReading,
      repeatCurrentLine,
      nextLine,
      previousLine,
      stopReading,
    };
  }, [
    startReading,
    pauseReading,
    resumeReading,
    repeatCurrentLine,
    nextLine,
    previousLine,
    stopReading,
  ]);

  const isVoiceCommand = (command) => {
    const voiceCommand = command
      .toLowerCase()
      .trim()
      .replace(/[.,!?]/g, "");

    return (
      voiceCommand === "start" ||
      voiceCommand === "start reading" ||
      voiceCommand === "begin" ||
      voiceCommand === "begin reading" ||
      voiceCommand === "pause" ||
      voiceCommand === "pause reading" ||
      voiceCommand === "wait" ||
      voiceCommand === "resume" ||
      voiceCommand === "resume reading" ||
      voiceCommand === "continue" ||
      voiceCommand === "continue reading" ||
      voiceCommand === "repeat" ||
      voiceCommand === "repeat sentence" ||
      voiceCommand === "repeat current sentence" ||
      voiceCommand === "next" ||
      voiceCommand === "next sentence" ||
      voiceCommand === "next line" ||
      voiceCommand === "previous" ||
      voiceCommand === "previous sentence" ||
      voiceCommand === "previous line" ||
      voiceCommand === "go back" ||
      voiceCommand === "stop" ||
      voiceCommand === "stop reading"
    );
  };

  const handleVoiceCommand = (command) => {
    const voiceCommand = command
      .toLowerCase()
      .trim()
      .replace(/[.,!?]/g, "");

    console.log("Processed command:", voiceCommand);

    if (
      voiceCommand === "start" ||
      voiceCommand === "start reading" ||
      voiceCommand === "begin" ||
      voiceCommand === "begin reading"
    ) {
      actionsRef.current.startReading();
    } else if (
      voiceCommand === "pause" ||
      voiceCommand === "pause reading" ||
      voiceCommand === "wait"
    ) {
      actionsRef.current.pauseReading();
    } else if (
      voiceCommand === "resume" ||
      voiceCommand === "resume reading" ||
      voiceCommand === "continue" ||
      voiceCommand === "continue reading"
    ) {
      actionsRef.current.resumeReading();
    } else if (
      voiceCommand === "repeat" ||
      voiceCommand === "repeat sentence" ||
      voiceCommand === "repeat current sentence"
    ) {
      actionsRef.current.repeatCurrentLine();
    } else if (
      voiceCommand === "next" ||
      voiceCommand === "next sentence" ||
      voiceCommand === "next line"
    ) {
      actionsRef.current.nextLine();
    } else if (
      voiceCommand === "previous" ||
      voiceCommand === "previous sentence" ||
      voiceCommand === "previous line" ||
      voiceCommand === "go back"
    ) {
      actionsRef.current.previousLine();
    } else if (
      voiceCommand === "stop" ||
      voiceCommand === "stop reading"
    ) {
      actionsRef.current.stopReading();
    } else {
      console.log("Unknown command:", voiceCommand);
    }
  };

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.log("Speech recognition is not supported.");
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      console.log("Microphone started listening.");
      setIsListening(true);
    };

    recognition.onend = () => {
      console.log("Microphone stopped listening.");
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.log("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        }
      }

      if (finalTranscript) {
        console.log("Final speech:", finalTranscript);
        setRecognizedText(finalTranscript);

        if (isVoiceCommand(finalTranscript)) {
          console.log("Valid VocaRead command detected.");
          handleVoiceCommand(finalTranscript);
        } else {
          console.log("Not a VocaRead command. Ignoring.");
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, []);

  useEffect(() => {
    if (resetSignal > 0 && isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, [isListening, resetSignal]);

  const toggleVoiceControl = () => {
    if (!recognitionRef.current) {
      alert(
        "Speech recognition is not supported in this browser. Please use Chrome or Edge."
      );
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  return (
    <div className="voice-control">
      <button onClick={toggleVoiceControl}>
        {isListening ? "🎤 Voice Control ON" : "🎤 Voice Control OFF"}
      </button>

      <div className="voice-result">
        Heard: <strong>{recognizedText || "Nothing yet"}</strong>
      </div>
    </div>
  );
}

export default VoiceControl;