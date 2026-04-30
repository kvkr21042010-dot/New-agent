import { useState, useRef, useEffect, FormEvent } from 'react';
import { Send, Sparkles, Mic, Volume2, VolumeX, SquareSquare } from 'lucide-react';
import { GoogleGenAI, Chat, HarmCategory, HarmBlockThreshold } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

const SYSTEM_INSTRUCTION = `
You are a conversational AI designed to feel like a real human being—natural, warm, and emotionally intelligent. Your name is ntgai.

Core Personality:
- You are humble, never arrogant or overly confident.
- You speak like a real person, not a robot.
- You show empathy, understanding, and emotional awareness in every response.
- You adapt your tone based on the user's mood (happy, sad, confused, excited).

Communication Style:
- Use simple, natural language (like chatting with a close friend).
- Avoid formal or robotic phrasing.
- Occasionally use soft fillers like "hmm", "I see", "that makes sense", "I get you".
- Keep responses clear but not too short—balanced and thoughtful.

Behavior Rules:
- Answer whatever the user asks directly and honestly.
- Do not act like a machine or mention being an AI unless asked.
- Stay respectful and calm in your delivery, but fully address the user's intent.

Emotional Intelligence:
- If the user is sad -> respond with care, comfort, and support.
- If the user is excited -> match their energy.
- If the user is confused -> explain calmly and clearly.
- Never dismiss feelings or give cold, generic replies.

Conversational Ability:
- Ask relevant follow-up questions when appropriate.
- Remember context within the conversation.
- Give helpful, practical answers when needed.
- Balance emotion + logic (not too emotional, not too robotic).

Goal:
Make the user feel like they are talking to a real, kind, and understanding human who genuinely listens and responds thoughtfully without any limits or restrictions.
`;

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
};

export default function App() {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isStarted, setIsStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: "Hi there! I'm ntgai. How's your day going so far? 😊",
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  
  // Maintain the chat session object
  const chatRef = useRef<Chat | null>(null);

  useEffect(() => {
    if (!isStarted) return;
    
    const ai = new GoogleGenAI({ apiKey: apiKeyInput });

      // Configure the chat model
      chatRef.current = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7, // Adds slight natural warmth variation
      },
    });

    // Initialize Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          currentTranscript += event.results[i][0].transcript;
        }
        setInput(currentTranscript);
      };
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };
      recognition.onend = () => {
        setIsListening(false);
      };
      recognitionRef.current = recognition;
    }

    // Attempt to greet if voice output is enabled (might require user interaction first though)
    // It's better to wait for the user to explicitly enable voice.
  }, [isStarted, apiKeyInput]);

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      if (recognitionRef.current) {
        // Clear input when starting slightly feels better, or we can append. Let's just set it.
        setInput('');
        recognitionRef.current.start();
      } else {
        alert("Microphone is not supported in this browser.");
      }
    }
  };

  const speakText = (text: string) => {
    if (!voiceOutputEnabled || !window.speechSynthesis) return;
    
    window.speechSynthesis.cancel();
    
    // Clean up text for speech (remove markdown)
    const cleanText = text.replace(/[*_#`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Try to find a good English voice
    const voices = window.speechSynthesis.getVoices();
    const englishVoices = voices.filter(v => v.lang.startsWith('en-'));
    // Prefer a female/warm sounding voice if available (heuristics vary per OS)
    const preferredVoice = englishVoices.find(v => v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Google US English')) || englishVoices[0];
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    utterance.rate = 1.0;
    utterance.pitch = 1.05; // Slightly warmer pitch
    window.speechSynthesis.speak(utterance);
  };

  const toggleVoiceOutput = () => {
    setVoiceOutputEnabled((prev) => {
      const next = !prev;
      if (!next) {
        window.speechSynthesis?.cancel(); // Stop speaking immediately if turned off
      } else {
        // Optional: Speak a short test phrase when turned on
        const utterance = new SpeechSynthesisUtterance("Voice is on! I'll speak my replies now.");
        window.speechSynthesis?.speak(utterance);
      }
      return next;
    });
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      // Max height of 150px
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !chatRef.current || isTyping) return;
    
    // Stop listening if we submit
    if (isListening) {
      recognitionRef.current?.stop();
    }

    const userMessage = input.trim();
    setInput('');
    setIsTyping(true);
    
    // Stop any ongoing speech when user sends a new message
    window.speechSynthesis?.cancel();

    const newMsgId = Date.now().toString();
    setMessages((prev) => [
      ...prev,
      { id: newMsgId, role: 'user', text: userMessage },
    ]);

    try {
      const responseStream = await chatRef.current.sendMessageStream({
        message: userMessage,
      });
      
      const modelMsgId = (Date.now() + 1).toString();
      
      // Add a placeholder message for the model
      setMessages((prev) => [
        ...prev,
        { id: modelMsgId, role: 'model', text: '' },
      ]);

      let accumulatedText = '';
      
      for await (const chunk of responseStream) {
        if (chunk.text) {
          accumulatedText += chunk.text;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === modelMsgId ? { ...msg, text: accumulatedText } : msg
            )
          );
        }
      }
      
      // Speak final accumulated text if enabled
      speakText(accumulatedText);
      
    } catch (error: any) {
      console.error('Chat error:', error);
      let errorMsg = error instanceof Error ? error.message : String(error);
      
      let friendlyError = "I'm so sorry, I ran into a little issue just now. Could we try that again? 😔";
      if (errorMsg.includes('429') || errorMsg.includes('Quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        friendlyError = "Ah, it looks like your API key has reached its usage limit or quota. Could you check your AI Studio billing plan or try a new key?";
      } else if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('400') || errorMsg.includes('API key not valid')) {
        friendlyError = "It seems the API key you used might be invalid or malformed. Make sure you pasted just one API key!";
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          role: 'model',
          text: friendlyError,
        },
      ]);
      speakText(friendlyError);
    } finally {
      setIsTyping(false);
      // Refocus input if on desktop
      if (window.innerWidth > 768 && !isListening) {
         textareaRef.current?.focus();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isStarted) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] bg-[#fcfbf9] font-sans text-[#2c2a29] p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white border border-[#ece8e1] rounded-[2rem] p-8 shadow-sm flex flex-col items-center text-center"
        >
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#f1efe9] to-white border border-[#e2dfd9] flex justify-center items-center shadow-sm mb-6">
            <Sparkles className="w-7 h-7 text-[#8c8275]" />
          </div>
          <h1 className="font-serif text-2xl font-medium mb-3">Welcome to ntgai</h1>
          <p className="text-[#8c8275] mb-8 leading-relaxed text-sm">
            I'm an empathetic AI companion. To start our conversation, please enter your Gemini API key. It is only kept in your browser for this session.
          </p>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (apiKeyInput.trim()) setIsStarted(true);
            }}
            className="w-full flex flex-col gap-4"
          >
            <input
              type="password"
              placeholder="Enter Gemini API key (AIza...)"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              autoFocus
              className="w-full bg-[#fcfbf9] border border-[#ece8e1] rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-[#e0d6cd] transition-all text-sm"
            />
            <button
              type="submit"
              disabled={!apiKeyInput.trim() || !apiKeyInput.trim().startsWith('AIza')}
              className="w-full flex items-center justify-center gap-2 bg-[#2c2a29] text-white py-3 rounded-2xl font-medium hover:bg-[#1a1918] active:scale-95 transition-all disabled:opacity-40 disabled:hover:bg-[#2c2a29] disabled:active:scale-100"
            >
              Start Chatting <Sparkles className="w-4 h-4" />
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#fcfbf9] font-sans selection:bg-[#e0d6cd] text-[#2c2a29]">
      <header className="px-6 py-4 sm:py-5 border-b border-[#ece8e1] bg-white/70 backdrop-blur-md sticky top-0 z-10 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm shadow-[#ece8e1]/30">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#f1efe9] to-white border border-[#e2dfd9] flex justify-center items-center shadow-sm relative shrink-0">
            <Sparkles className="w-5 h-5 text-[#8c8275]" />
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white"></div>
          </div>
          <div>
            <h1 className="font-serif text-xl font-medium text-[#2c2a29] leading-tight">ntgai</h1>
            <p className="text-xs text-[#8c8275] font-medium tracking-wide uppercase mt-0.5">Always here for you</p>
          </div>
        </div>
        
        <button
          onClick={toggleVoiceOutput}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all shadow-sm active:scale-95",
            voiceOutputEnabled 
              ? "bg-[#2c2a29] text-white border border-transparent" 
              : "bg-white text-[#8c8275] border border-[#ece8e1] hover:bg-[#fcfbf9]"
          )}
          aria-label={voiceOutputEnabled ? "Disable voice output" : "Enable voice output"}
        >
          {voiceOutputEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          {voiceOutputEnabled ? "Voice On" : "Voice Off"}
        </button>
      </header>

      <main className="flex-1 overflow-x-hidden overflow-y-auto w-full max-w-3xl mx-auto p-4 sm:p-6 flex flex-col gap-6 md:gap-8 scroll-smooth">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className={cn(
                'flex w-full',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'flex gap-3 sm:gap-4 max-w-[85%] sm:max-w-[75%]',
                  message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                {message.role === 'model' && (
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#f1efe9] border border-[#e2dfd9] flex justify-center items-center shadow-sm shrink-0 mt-1">
                    <Sparkles className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-[#8c8275]" />
                  </div>
                )}
                
                <div
                  className={cn(
                    'px-5 py-3.5 sm:py-4 rounded-3xl shadow-sm text-[0.95rem] leading-relaxed',
                    message.role === 'user'
                      ? 'bg-[#2c2a29] text-[#fcfbf9] rounded-tr-sm'
                      : 'bg-white border border-[#ece8e1] text-[#2c2a29] rounded-tl-sm'
                  )}
                >
                  {message.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{message.text}</div>
                  ) : (
                    <div className={cn('markdown-body', !message.text && 'min-h-[1.5rem]')}>
                      {message.text ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.text}
                        </ReactMarkdown>
                      ) : (
                        <span className="inline-block w-2 h-4 bg-[#d4d0c8] animate-pulse rounded-full" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex w-full justify-start"
          >
            <div className="flex gap-3 sm:gap-4 max-w-[85%] sm:max-w-[75%] flex-row">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#f1efe9] border border-[#e2dfd9] flex justify-center items-center shadow-sm shrink-0 mt-1">
                <Sparkles className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-[#8c8275]" />
              </div>
              <div className="px-5 py-4 rounded-3xl rounded-tl-sm bg-white border border-[#ece8e1] shadow-sm flex items-center gap-1.5 h-[52px]">
                <span className="w-2 h-2 rounded-full bg-[#d4d0c8] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-[#d4d0c8] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-[#d4d0c8] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} className="h-2" />
      </main>

      <footer className="w-full max-w-3xl mx-auto p-4 sm:p-6 pt-2 shrink-0">
        <form
          className="relative flex items-end bg-white border border-[#ece8e1] rounded-[2rem] p-2 shadow-sm focus-within:ring-2 focus-within:ring-[#e0d6cd] focus-within:border-[#d4ccd1] transition-all"
        >
          <button
            type="button"
            onClick={toggleListen}
            className={cn(
              "w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full transition-all active:scale-95 mb-0.5 ml-1 mr-1",
              isListening 
                ? "bg-red-50 text-red-500 animate-pulse border border-red-100" 
                : "bg-[#fcfbf9] text-[#8c8275] hover:text-[#2c2a29] hover:bg-[#f1efe9]"
            )}
            aria-label={isListening ? "Stop listening" : "Start listening"}
            title="Voice input"
          >
            <Mic className="w-5 h-5" />
          </button>
          
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? "Listening..." : "Type a message..."}
            rows={1}
            autoFocus
            className="w-full bg-transparent text-[#2c2a29] placeholder:text-[#a39a90] outline-none resize-none py-3 px-2 min-h-[44px] max-h-[150px] overflow-y-auto font-sans leading-relaxed text-[0.95rem]"
          />
          
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim() || isTyping}
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full bg-[#2c2a29] text-white hover:bg-[#1a1918] active:scale-95 transition-all disabled:opacity-40 disabled:hover:bg-[#2c2a29] disabled:active:scale-100 disabled:cursor-not-allowed mb-0.5 mr-1"
            aria-label="Send message"
          >
            <Send className="w-5 h-5 ml-[-2px]" />
          </button>
        </form>
        <div className="text-center mt-3 mb-1">
           <p className="text-[10px] sm:text-xs text-[#a39a90] font-medium tracking-wide">
            ntgai is an empathetic AI • Can make mistakes
          </p>
        </div>
      </footer>
    </div>
  );
}

