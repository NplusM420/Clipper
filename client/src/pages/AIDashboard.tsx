import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { SettingsModal } from "@/components/SettingsModal";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useSocket } from "@/hooks/useSocket";
import {
  Brain,
  Settings,
  User,
  LogOut,
  Send,
  FileVideo,
  AlertCircle,
  ArrowLeft,
  MessageSquare,
  Loader2,
  Sparkles,
  Clock,
  Play,
  Check,
  ChevronDown,
  History,
  Trash2,
} from "lucide-react";
import type { Video as VideoType } from "@shared/schema";

// AI Model configurations
const AI_MODELS = {
  SMALL: {
    id: 'google/gemma-3-27b-it',
    name: 'Gemma 27B',
    role: 'Conversational Coordinator',
    description: 'Handles conversations and coordinates other models',
  },
  MEDIUM: {
    id: 'z-ai/glm-4.5',
    name: 'GLM 4.5',
    role: 'Clip Analysis Specialist',
    description: 'Superior logical reasoning for viral clip discovery',
  },
  LARGE: {
    id: 'meta-llama/llama-4-maverick',
    name: 'Llama 4 Maverick',
    role: 'Deep Content Processor',
    description: 'Comprehensive analysis of long-form content',
  },
} as const;

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  content: string;
  timestamp: Date;
  type: 'text' | 'clip_suggestion' | 'analysis';
  metadata?: {
    clips?: Array<{
      title: string;
      startTime: number;
      endTime: number;
      confidence: number;
      platform: string;
    }>;
    processing?: boolean;
  };
}

// Conversation starter templates
const CONVERSATION_STARTERS = [
  "What is this video about?",
  "Find the most interesting moments",
  "Create viral clips for TikTok",
  "Give me a summary of key points",
  "What topics are covered and when?",
  "Find mentions of specific keywords"
];

export default function AIDashboard() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { socket, connected } = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // State management
  const [selectedVideo, setSelectedVideo] = useState<VideoType | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [creatingClips, setCreatingClips] = useState<Set<string>>(new Set());
  const [createdClips, setCreatedClips] = useState<Set<string>>(new Set());

  // Chat history management
  interface ChatSession {
    id: string;
    videoId: string;
    videoName: string;
    lastActivity: Date;
    messageCount: number;
    hasClipSuggestions: boolean;
  }

  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [showChatHistory, setShowChatHistory] = useState(false);

  // Content analysis state
  const [detectedTopics, setDetectedTopics] = useState<string[]>([]);
  const [keyMoments, setKeyMoments] = useState<Array<{
    title: string;
    startTime: number;
    endTime: number;
    confidence: number;
  }>>([]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      toast({
        title: "Session expired",
        description: "Please log in again",
        variant: "destructive",
      });
    }
  }, [isAuthenticated, toast]);

  // Fetch user videos (only ready ones)
  const { data: videos = [], isLoading: videosLoading } = useQuery<VideoType[]>({
    queryKey: ["/api/videos"],
    enabled: isAuthenticated,
    select: (data) => data.filter(video => video.status === 'ready'),
  });

  // Check if user has OpenRouter configured
  const { data: openRouterSettings } = useQuery({
    queryKey: ["/api/chat/user/openrouter-settings"],
    enabled: isAuthenticated,
  });

  const hasOpenRouterKey = (openRouterSettings as any)?.configured;

  // Fetch chat sessions for current video
  const { data: sessionHistory = [], refetch: refetchSessions } = useQuery({
    queryKey: ["/api/chat/sessions", selectedVideo?.id],
    enabled: isAuthenticated && !!selectedVideo,
    select: (data: any[]) => data.map(session => ({
      ...session,
      lastActivity: new Date(session.lastActivity)
    }))
  });

  // Update chat sessions state when data changes
  useEffect(() => {
    if (sessionHistory) {
      setChatSessions(sessionHistory);
    }
  }, [sessionHistory]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // WebSocket authentication and event handling
  useEffect(() => {
    if (!socket || !connected || !user) return;

    console.log('🔌 Setting up WebSocket authentication and handlers');
    
    // Track authentication status locally to prevent join before auth
    let isSocketAuthenticated = false;

    // Authenticate with WebSocket
    socket.emit('authenticate', {
      userId: user.id,
      username: user.username
    });

    // Handle authentication response
    const handleAuthenticated = (data: { success: boolean }) => {
      console.log('✅ WebSocket authenticated:', data.success);
      isSocketAuthenticated = !!data.success;
    };

    // Handle session joined
    const handleSessionJoined = (data: { sessionId: string; messages: any[] }) => {
      console.log('🏠 Joined chat session:', data.sessionId);
      setCurrentSessionId(data.sessionId);
      
      // Convert messages to ChatMessage format
      const convertedMessages: ChatMessage[] = data.messages.map(msg => ({
        id: msg.id,
        sender: msg.sender,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        type: msg.messageType === 'clip_suggestion' ? 'clip_suggestion' : 
              msg.messageType === 'analysis' ? 'analysis' : 'text',
        metadata: msg.metadata
      }));
      
      setMessages(convertedMessages);
    };

    // Handle new messages
    const handleMessageReceived = (data: any) => {
      console.log('💬 Received message:', data);
      const newMessage: ChatMessage = {
        id: data.id,
        sender: data.sender,
        content: data.content,
        timestamp: new Date(data.timestamp),
        type: data.messageType === 'clip_suggestion' ? 'clip_suggestion' : 
              data.messageType === 'analysis' ? 'analysis' : 'text',
        metadata: data.metadata
      };
      
      setMessages(prev => [...prev, newMessage]);
      setIsTyping(false);
    };

    // Handle AI typing indicator
    const handleAITyping = (data: { isTyping: boolean }) => {
      console.log('⌨️ AI typing status:', data.isTyping);
      setIsTyping(data.isTyping);
    };

    // Handle errors
    const handleError = (data: { message: string }) => {
      console.error('❌ WebSocket error:', data.message);
      setIsTyping(false);
      toast({
        title: "Error",
        description: data.message,
        variant: "destructive",
      });
    };

    // Handle clip creation success
    const handleClipCreated = (data: { clipId: string; createdClipId: string; title: string; success: boolean }) => {
      console.log('🎬 Clip created successfully:', data);
      
      // Remove from creating state and add to created state
      setCreatingClips(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.clipId);
        return newSet;
      });
      
      setCreatedClips(prev => {
        const newSet = new Set(prev);
        newSet.add(data.clipId);
        return newSet;
      });
      
      toast({
        title: "Clip Created Successfully! 🎬",
        description: `"${data.title}" has been created and is ready for download`,
      });
    };

    // Handle clip creation errors
    const handleClipCreationError = (data: { clipId: string; error: string }) => {
      console.error('❌ Clip creation failed:', data);
      
      // Remove from creating state
      setCreatingClips(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.clipId);
        return newSet;
      });
      
      toast({
        title: "Clip Creation Failed",
        description: data.error,
        variant: "destructive",
      });
    };

    // Handle clip processing completion
    const handleClipProcessingComplete = (data: { clipId: string; createdClipId: string; title: string; status: string }) => {
      console.log('🎬 Clip processing completed:', data);
      toast({
        title: "Clip Processing Complete! 🎉",
        description: `"${data.title}" has been processed and uploaded to Cloudinary`,
      });
    };

    // Handle clip processing errors
    const handleClipProcessingError = (data: { clipId: string; createdClipId: string; title: string; error: string }) => {
      console.error('❌ Clip processing failed:', data);
      toast({
        title: "Clip Processing Failed",
        description: `Failed to process "${data.title}": ${data.error}`,
        variant: "destructive",
      });
    };

    // Register event listeners
    socket.on('authenticated', handleAuthenticated);
    socket.on('session_joined', handleSessionJoined);
    socket.on('message_received', handleMessageReceived);
    socket.on('ai_typing', handleAITyping);
    socket.on('error', handleError);
    socket.on('clip_created', handleClipCreated);
    socket.on('clip_creation_error', handleClipCreationError);
    socket.on('clip_processing_complete', handleClipProcessingComplete);
    socket.on('clip_processing_error', handleClipProcessingError);

    // Cleanup on unmount
    return () => {
      socket.off('authenticated', handleAuthenticated);
      socket.off('session_joined', handleSessionJoined);
      socket.off('message_received', handleMessageReceived);
      socket.off('ai_typing', handleAITyping);
      socket.off('error', handleError);
      socket.off('clip_created', handleClipCreated);
      socket.off('clip_creation_error', handleClipCreationError);
      socket.off('clip_processing_complete', handleClipProcessingComplete);
      socket.off('clip_processing_error', handleClipProcessingError);
    };
  }, [socket, connected, user, toast]);

  // Join session when video is selected and socket is authenticated
  useEffect(() => {
    if (!socket || !connected || !selectedVideo || !user) return;

    const tryJoin = () => {
      console.log('🎥 Joining session for video:', selectedVideo.id);
      socket.emit('join_session', { videoId: selectedVideo.id });
      // Clear messages when switching videos
      setMessages([]);
      setCurrentSessionId(null);
    };

    // If the server already acknowledged auth in this lifecycle, we can join immediately
    // Otherwise, wait for the 'authenticated' acknowledgment then join once
    let joined = false;
    const onAuthenticated = (data: { success: boolean }) => {
      if (data.success && !joined) {
        joined = true;
        tryJoin();
        socket.off('authenticated', onAuthenticated);
      }
    };

    socket.on('authenticated', onAuthenticated);

    // Fire a delayed join attempt as a fallback (in case authenticated already fired)
    const t = setTimeout(() => {
      if (!joined) {
        tryJoin();
        socket.off('authenticated', onAuthenticated);
      }
    }, 150);

    return () => {
      clearTimeout(t);
      socket.off('authenticated', onAuthenticated);
    };
  }, [socket, connected, selectedVideo, user]);

  // Initialize conversation with welcome message
  useEffect(() => {
    if (selectedVideo && messages.length === 0 && currentSessionId) {
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        sender: 'ai',
        content: `Hi! I'm your AI video assistant. I can see you've selected "${selectedVideo.filename}". What would you like to know about this video? I can help you find specific moments, create viral clips, analyze content, or answer questions about what's discussed.`,
        timestamp: new Date(),
        type: 'text',
      };
      setMessages([welcomeMessage]);
    }
  }, [selectedVideo, currentSessionId]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !selectedVideo || !currentSessionId || !socket || !connected) return;

    if (!hasOpenRouterKey) {
      toast({
        title: "OpenRouter Not Configured",
        description: "Please configure your OpenRouter API key in Settings first",
        variant: "destructive",
      });
      setIsSettingsModalOpen(true);
      return;
    }

    const messageContent = inputMessage.trim();
    setInputMessage("");
    setIsTyping(true);

    try {
      console.log('📤 Sending chat message:', {
        sessionId: currentSessionId,
        content: messageContent,
        videoId: selectedVideo.id
      });

      // Send message via WebSocket
      socket.emit('chat_message', {
        sessionId: currentSessionId,
        content: messageContent,
        videoId: selectedVideo.id
      });

    } catch (error) {
      console.error('❌ Failed to send message:', error);
      setIsTyping(false);
      toast({
        title: "Error",
        description: "Failed to send your message. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Connection status display
  const getConnectionStatus = () => {
    if (!connected) return { status: 'Disconnected', color: 'red' };
    if (!currentSessionId) return { status: 'Connecting...', color: 'yellow' };
    return { status: 'Connected', color: 'green' };
  };

  const handleStarterClick = (starter: string) => {
    setInputMessage(starter);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Chat session management functions
  const handleSwitchSession = async (sessionId: string) => {
    if (!socket || !connected || !selectedVideo) return;
    
    try {
      console.log('🔄 Switching to session:', sessionId);
      
      // Clear current messages and state
      setMessages([]);
      setCurrentSessionId(null);
      setCreatingClips(new Set());
      setCreatedClips(new Set());
      
      // Join the selected session
      socket.emit('join_session', { 
        videoId: selectedVideo.id, 
        sessionId: sessionId 
      });
      
      toast({
        title: "Session Loaded",
        description: "Switched to previous chat session",
      });
    } catch (error) {
      console.error('Failed to switch session:', error);
      toast({
        title: "Error",
        description: "Failed to load chat session",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Refresh sessions list
        refetchSessions();
        
        // If we deleted the current session, start a new one
        if (currentSessionId === sessionId) {
          setMessages([]);
          setCurrentSessionId(null);
          if (socket && selectedVideo) {
            socket.emit('join_session', { videoId: selectedVideo.id, newSession: true });
          }
        }
        
        toast({
          title: "Session Deleted",
          description: "Chat history has been removed",
        });
      } else {
        throw new Error('Failed to delete session');
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
      toast({
        title: "Error",
        description: "Failed to delete chat session",
        variant: "destructive",
      });
    }
  };

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Content analysis functions
  const extractTopicsFromMessages = (messages: ChatMessage[]): string[] => {
    const topics = new Set<string>();
    
    messages.forEach(message => {
      if (message.sender === 'ai' && message.content) {
        const content = message.content.toLowerCase();
        
        // Topic detection patterns
        const topicPatterns = {
          'AI & Technology': /\b(ai|artificial intelligence|machine learning|technology|automation|digital|algorithms|models)\b/g,
          'Business Strategy': /\b(business|strategy|market|revenue|growth|investment|startup|company|enterprise)\b/g,
          'Content Creation': /\b(content|video|clips|social media|tiktok|youtube|instagram|creator|viral)\b/g,
          'Future Trends': /\b(future|trend|innovation|emerging|next|upcoming|prediction|forecast)\b/g,
          'Industry Insights': /\b(industry|sector|market|analysis|insights|expertise|professional|experience)\b/g,
          'Education': /\b(learn|education|tutorial|guide|teach|explain|knowledge|understanding)\b/g,
          'Entertainment': /\b(funny|humor|entertainment|comedy|amusing|laugh|joke|hilarious)\b/g,
          'Health & Wellness': /\b(health|wellness|fitness|medical|mental|physical|wellbeing)\b/g,
          'Finance': /\b(finance|money|investment|economic|financial|budget|cost|price)\b/g,
          'Communication': /\b(communication|speaking|presentation|interview|conversation|discuss)\b/g
        };

        Object.entries(topicPatterns).forEach(([topic, pattern]) => {
          const matches = content.match(pattern);
          if (matches && matches.length >= 2) { // Require multiple mentions
            topics.add(topic);
          }
        });
      }
    });

    return Array.from(topics).slice(0, 6); // Limit to 6 topics
  };

  const extractKeyMomentsFromMessages = (messages: ChatMessage[]): Array<{
    title: string;
    startTime: number;
    endTime: number;
    confidence: number;
  }> => {
    const moments: Array<{
      title: string;
      startTime: number;
      endTime: number;
      confidence: number;
    }> = [];

    messages.forEach(message => {
      if (message.sender === 'ai' && message.metadata?.clips) {
        message.metadata.clips.forEach(clip => {
          moments.push({
            title: clip.title,
            startTime: clip.startTime,
            endTime: clip.endTime,
            confidence: clip.confidence
          });
        });
      }
    });

    // Sort by confidence and take top moments
    return moments
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  };

  // Update topics and key moments when messages change
  useEffect(() => {
    if (messages.length > 0 && selectedVideo) {
      const topics = extractTopicsFromMessages(messages);
      const moments = extractKeyMomentsFromMessages(messages);
      
      setDetectedTopics(topics);
      setKeyMoments(moments);
    }
  }, [messages, selectedVideo]);

  const goBackToDashboard = () => {
    window.location.href = '/';
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <MessageSquare className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold">AI Assistant</h1>
            </div>
            <nav className="hidden md:flex space-x-1">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={goBackToDashboard}
                data-testid="nav-dashboard"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
              <Button variant="default" size="sm" data-testid="nav-ai-assistant">
                <MessageSquare className="h-4 w-4 mr-2" />
                AI Assistant
              </Button>
              {/* Chat History Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="chat-history-dropdown"
                  >
                    <History className="h-4 w-4 mr-2" />
                    Chat History
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-80">
                  {/* New Chat Option */}
                  <DropdownMenuItem
                    onClick={() => {
                      setMessages([]);
                      setCurrentSessionId(null);
                      if (socket && selectedVideo) {
                        socket.emit('join_session', { videoId: selectedVideo.id, newSession: true });
                      }
                      toast({
                        title: "New Chat Started",
                        description: "Starting a fresh conversation about this video",
                      });
                    }}
                    className="cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Start New Chat
                  </DropdownMenuItem>
                  
                  {chatSessions.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Recent Sessions ({chatSessions.length})
                      </div>
                      {chatSessions.slice(0, 10).map((session) => (
                        <DropdownMenuItem
                          key={session.id}
                          className="cursor-pointer"
                          onClick={() => handleSwitchSession(session.id)}
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center space-x-2 flex-1">
                              <MessageSquare className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="text-xs font-medium truncate">
                                  {session.videoName || 'Chat Session'}
                                </span>
                                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                                  <span>{session.messageCount} messages</span>
                                  <span>•</span>
                                  <span>{formatRelativeTime(session.lastActivity)}</span>
                                  {session.hasClipSuggestions && (
                                    <>
                                      <span>•</span>
                                      <Badge variant="secondary" className="text-xs px-1 py-0">
                                        Clips
                                      </Badge>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSession(session.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  
                  {chatSessions.length === 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                        No previous chat sessions
                      </div>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSettingsModalOpen(true)}
                data-testid="nav-settings"
              >
                Settings
              </Button>
            </nav>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm">
              <User className="h-4 w-4" />
              <span>{user?.username}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.href = '/auth'}
              data-testid="logout-button"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Sidebar - Content Analysis */}
        <div className="w-80 border-r bg-muted/20 flex flex-col">
          <div className="p-4 border-b">
            <h3 className="font-medium flex items-center space-x-2">
              <Brain className="h-4 w-4 text-blue-500" />
              <span>Content Analysis</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              AI-powered insights about your video
            </p>
          </div>
          <ScrollArea className="flex-1 p-4">
            {selectedVideo ? (
              <div className="space-y-4">
                {/* Video Overview */}
                <div className="bg-card rounded-lg p-3 border">
                  <h4 className="font-medium text-sm mb-2">Video Overview</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duration:</span>
                      <span>{formatTime(selectedVideo.duration)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant="outline" className="text-xs">Ready</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">File:</span>
                      <span className="truncate max-w-32" title={selectedVideo.filename}>
                        {selectedVideo.filename}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Content Topics - Dynamic */}
                <div className="bg-card rounded-lg p-3 border">
                  <h4 className="font-medium text-sm mb-2 flex items-center justify-between">
                    <span>Detected Topics</span>
                    {detectedTopics.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {detectedTopics.length}
                      </Badge>
                    )}
                  </h4>
                  <div className="space-y-1">
                    {detectedTopics.length > 0 ? (
                      detectedTopics.map((topic, index) => (
                        <Badge 
                          key={index}
                          variant="secondary" 
                          className="text-xs mr-1 mb-1"
                        >
                          {topic}
                        </Badge>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground text-center py-2">
                        Topics will appear as you chat with the AI about this video
                      </div>
                    )}
                  </div>
                  {detectedTopics.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Topics detected from AI conversation analysis
                    </p>
                  )}
                </div>

                {/* Key Moments - Dynamic */}
                <div className="bg-card rounded-lg p-3 border">
                  <h4 className="font-medium text-sm mb-2 flex items-center justify-between">
                    <span>Key Moments</span>
                    {keyMoments.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {keyMoments.length}
                      </Badge>
                    )}
                  </h4>
                  <div className="space-y-2 text-xs max-h-48 overflow-y-auto">
                    {keyMoments.length > 0 ? (
                      keyMoments.map((moment, index) => (
                        <div 
                          key={index}
                          className="flex items-center justify-between p-2 bg-muted/50 rounded hover:bg-muted cursor-pointer transition-colors"
                          onClick={() => {
                            // Future: Could implement video seeking functionality
                            toast({
                              title: "Key Moment",
                              description: `"${moment.title}" at ${formatTime(moment.startTime)}`,
                            });
                          }}
                        >
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="truncate font-medium">{moment.title}</span>
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge variant="secondary" className="text-xs px-1 py-0">
                                {moment.confidence}%
                              </Badge>
                              <span className="text-muted-foreground">
                                {formatTime(moment.startTime)}-{formatTime(moment.endTime)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground text-center py-4">
                        Key moments will appear when AI suggests clips from this video
                      </div>
                    )}
                  </div>
                  {keyMoments.length > 0 ? (
                    <p className="text-xs text-muted-foreground mt-2">
                      Click moments to see details • Sorted by AI confidence
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-2">
                      Ask the AI to "find viral moments" or "create clips" to see key segments
                    </p>
                  )}
                </div>

                {/* Session Stats */}
                <div className="bg-card rounded-lg p-3 border">
                  <h4 className="font-medium text-sm mb-2">Session Stats</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Messages:</span>
                      <span>{messages.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">AI Calls:</span>
                      <span>{Math.floor(messages.length / 2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Clips Created:</span>
                      <span>{createdClips.size}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Processing:</span>
                      <span>{creatingClips.size}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
                <FileVideo className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Select a video to see content analysis</p>
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Video Context Bar */}
          {selectedVideo ? (
            <div className="bg-muted/30 border-b px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <FileVideo className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-medium">{selectedVideo.filename}</h3>
                    <p className="text-sm text-muted-foreground">
                      Duration: {formatTime(selectedVideo.duration)} • Ready for analysis
                    </p>
                  </div>
                </div>
                <Select value={selectedVideo.id} onValueChange={(value) => {
                  const video = videos.find(v => v.id === value);
                  setSelectedVideo(video || null);
                  setMessages([]); // Clear messages when switching videos
                }}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {videos.map(video => (
                      <SelectItem key={video.id} value={video.id}>
                        <div className="flex items-center space-x-2">
                          <FileVideo className="h-4 w-4" />
                          <span className="truncate max-w-36">{video.filename}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="bg-muted/30 border-b px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <div>
                    <h3 className="font-medium">Select a video to start chatting</h3>
                    <p className="text-sm text-muted-foreground">
                      Choose a video from your library to begin the conversation
                    </p>
                  </div>
                </div>
                <Select value="" onValueChange={(value) => {
                  const video = videos.find(v => v.id === value);
                  setSelectedVideo(video || null);
                }}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Choose video..." />
                  </SelectTrigger>
                  <SelectContent>
                    {videosLoading ? (
                      <SelectItem value="loading" disabled>Loading videos...</SelectItem>
                    ) : videos.length === 0 ? (
                      <SelectItem value="none" disabled>No ready videos available</SelectItem>
                    ) : (
                      videos.map(video => (
                        <SelectItem key={video.id} value={video.id}>
                          <div className="flex items-center space-x-2">
                            <FileVideo className="h-4 w-4" />
                            <span className="truncate max-w-36">{video.filename}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Chat Messages */}
          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-4 max-w-4xl mx-auto">
              {selectedVideo ? (
                <>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-3 ${
                          message.sender === 'user'
                            ? 'bg-primary text-primary-foreground ml-4'
                            : 'bg-muted mr-4'
                        }`}
                      >
                        {message.sender === 'ai' && (
                          <div className="flex items-center space-x-2 mb-2">
                            <Brain className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">AI Assistant</span>
                            <Badge variant="outline" className="text-xs">
                              {message.type === 'clip_suggestion' ? 'Clip Analysis' : 
                               message.type === 'analysis' ? 'Content Analysis' : 'Chat'}
                            </Badge>
                          </div>
                        )}
                        <div className="whitespace-pre-wrap">{message.content}</div>
                        
                        {message.metadata?.clips && (
                          <div className="mt-3 space-y-2">
                            {message.metadata.clips.map((clip, index) => {
                              const isCreating = creatingClips.has(clip.id);
                              const isCreated = createdClips.has(clip.id);
                              
                              return (
                                <Button
                                  key={index}
                                  variant={isCreated ? "default" : "outline"}
                                  size="sm"
                                  className={`w-full justify-start ${
                                    isCreated ? 'bg-green-600 hover:bg-green-700 text-white' : ''
                                  }`}
                                  disabled={isCreating || isCreated}
                                  onClick={() => {
                                    if (!socket || !connected) {
                                      toast({
                                        title: "Connection Error",
                                        description: "WebSocket not connected. Please refresh and try again.",
                                        variant: "destructive",
                                      });
                                      return;
                                    }
                                    
                                    // Add to creating state
                                    setCreatingClips(prev => new Set([...prev, clip.id]));
                                    
                                    toast({
                                      title: "Creating Clip",
                                      description: `Processing "${clip.title}" - this may take a few moments...`,
                                    });
                                    
                                    // Send clip creation request via WebSocket
                                    socket.emit('create_clips', {
                                      clipIds: [clip.id]
                                    });
                                  }}
                                >
                                  {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                  {isCreated && <Check className="h-4 w-4 mr-2" />}
                                  {!isCreating && !isCreated && <Play className="h-4 w-4 mr-2" />}
                                  
                                  {isCreating && "Creating..."}
                                  {isCreated && "Created!"}
                                  {!isCreating && !isCreated && `Create "${clip.title}"`}
                                  
                                  <Badge 
                                    variant={isCreated ? "outline" : "secondary"} 
                                    className={`ml-auto ${isCreated ? 'border-white text-white' : ''}`}
                                  >
                                    {formatTime(clip.startTime)}-{formatTime(clip.endTime)}
                                  </Badge>
                                </Button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-lg px-4 py-3 mr-4">
                        <div className="flex items-center space-x-2">
                          <Brain className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">AI Assistant</span>
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Analyzing video content... (~30 seconds)
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Using advanced AI models for deep analysis
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                  <MessageSquare className="h-16 w-16 text-muted-foreground" />
                  <div>
                    <h3 className="text-lg font-medium">Ready to Chat About Your Videos</h3>
                    <p className="text-muted-foreground mt-1">
                      Select a video above to start a conversation with your AI assistant
                    </p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Message Input */}
          {selectedVideo ? (
            <div className="border-t bg-background px-6 py-4">
              <div className="max-w-4xl mx-auto">
                {!hasOpenRouterKey && (
                  <Card className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/10">
                    <CardContent className="pt-4">
                      <div className="flex items-center space-x-2">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <span className="text-sm text-amber-900 dark:text-amber-100">
                          Configure your OpenRouter API key in Settings to start chatting
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsSettingsModalOpen(true)}
                          className="ml-auto"
                        >
                          Open Settings
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {messages.length === 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-muted-foreground mb-2">Conversation starters:</p>
                    <div className="flex flex-wrap gap-2">
                      {CONVERSATION_STARTERS.map((starter) => (
                        <Button
                          key={starter}
                          variant="outline"
                          size="sm"
                          onClick={() => handleStarterClick(starter)}
                          className="text-xs"
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          {starter}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex space-x-2">
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder={hasOpenRouterKey ? "Ask me anything about this video..." : "Configure OpenRouter API key first..."}
                    onKeyPress={handleKeyPress}
                    disabled={!hasOpenRouterKey || isTyping}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim() || !hasOpenRouterKey || isTyping}
                    size="sm"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Right Sidebar - Clip Builder */}
        <div className="w-80 border-l bg-muted/20 flex flex-col">
          <div className="p-4 border-b">
            <h3 className="font-medium flex items-center space-x-2">
              <Sparkles className="h-4 w-4 text-green-500" />
              <span>Clip Builder</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Create and manage your video clips
            </p>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {/* Active Models Status */}
              <div className="bg-card rounded-lg p-3 border">
                <h4 className="font-medium text-sm mb-2 flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>AI Models Active</span>
                </h4>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                      <span>Conversation</span>
                    </span>
                    <Badge variant="outline" className="text-xs">Ready</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                      <span>Clip Analysis</span>
                    </span>
                    <Badge variant="outline" className="text-xs">Standby</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                      <span>Deep Analysis</span>
                    </span>
                    <Badge variant="outline" className="text-xs">Standby</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Models activate automatically based on your requests
                </p>
              </div>

              {/* Suggested Clips - Dynamic */}
              <div className="bg-card rounded-lg p-3 border">
                <h4 className="font-medium text-sm mb-2 flex items-center space-x-2">
                  <Sparkles className="h-4 w-4 text-green-500" />
                  <span>Suggested Clips</span>
                  {(() => {
                    const allClips = messages
                      .filter(msg => msg.metadata?.clips)
                      .flatMap(msg => msg.metadata.clips);
                    return allClips.length > 0 && (
                      <Badge variant="secondary" className="text-xs ml-auto">
                        {allClips.length}
                      </Badge>
                    );
                  })()}
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {(() => {
                    const allClips = messages
                      .filter(msg => msg.metadata?.clips)
                      .flatMap(msg => msg.metadata.clips);
                    
                    return allClips.length > 0 ? (
                      allClips.map((clip, index) => {
                        const isCreating = creatingClips.has(clip.id);
                        const isCreated = createdClips.has(clip.id);
                        
                        return (
                          <Button
                            key={`sidebar-${clip.id}-${index}`}
                            variant={isCreated ? "default" : "outline"}
                            size="sm"
                            className={`w-full justify-start text-xs p-2 h-auto ${
                              isCreated ? 'bg-green-600 hover:bg-green-700 text-white' : ''
                            }`}
                            disabled={isCreating || isCreated}
                            onClick={() => {
                              if (!socket || !connected) {
                                toast({
                                  title: "Connection Error",
                                  description: "WebSocket not connected. Please refresh and try again.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              
                              setCreatingClips(prev => new Set([...prev, clip.id]));
                              
                              toast({
                                title: "Creating Clip",
                                description: `Processing "${clip.title}" - this may take a few moments...`,
                              });
                              
                              socket.emit('create_clips', {
                                clipIds: [clip.id]
                              });
                            }}
                          >
                            <div className="flex flex-col items-start w-full">
                              <div className="flex items-center w-full">
                                {isCreating && <Loader2 className="h-3 w-3 mr-2 animate-spin flex-shrink-0" />}
                                {isCreated && <Check className="h-3 w-3 mr-2 flex-shrink-0" />}
                                {!isCreating && !isCreated && <Play className="h-3 w-3 mr-2 flex-shrink-0" />}
                                
                                <span className="truncate flex-1">
                                  {isCreating && "Creating..."}
                                  {isCreated && "Created!"}
                                  {!isCreating && !isCreated && clip.title}
                                </span>
                              </div>
                              <div className="flex justify-between w-full mt-1">
                                <Badge 
                                  variant={isCreated ? "outline" : "secondary"} 
                                  className={`text-xs ${isCreated ? 'border-white text-white' : ''}`}
                                >
                                  {formatTime(clip.startTime)}-{formatTime(clip.endTime)}
                                </Badge>
                                <Badge 
                                  variant="secondary" 
                                  className={`text-xs ml-1 ${isCreated ? 'bg-green-100 text-green-800' : ''}`}
                                >
                                  {clip.confidence}%
                                </Badge>
                              </div>
                            </div>
                          </Button>
                        );
                      })
                    ) : (
                      <div className="text-xs text-muted-foreground text-center py-6">
                        Ask the AI to "create viral clips" to see suggestions here
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Clip Creation Tools */}
              <div className="bg-card rounded-lg p-3 border">
                <h4 className="font-medium text-sm mb-2">Quick Actions</h4>
                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs"
                    onClick={() => setInputMessage("Create viral clips for TikTok")}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    Find Viral Moments
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs"
                    onClick={() => setInputMessage("What are the key topics in this video?")}
                  >
                    <Brain className="h-3 w-3 mr-1" />
                    Analyze Content
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs"
                    onClick={() => setInputMessage("Find the funniest moments")}
                  >
                    <MessageSquare className="h-3 w-3 mr-1" />
                    Find Highlights
                  </Button>
                </div>
              </div>

              {/* Recent Clips - Dynamic */}
              <div className="bg-card rounded-lg p-3 border">
                <h4 className="font-medium text-sm mb-2 flex items-center space-x-2">
                  <Check className="h-4 w-4 text-green-500" />
                  <span>Recent Clips</span>
                  {createdClips.size > 0 && (
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {createdClips.size}
                    </Badge>
                  )}
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {createdClips.size > 0 ? (
                    Array.from(createdClips).map(clipId => {
                      // Find the clip details from messages
                      const clipDetails = messages
                        .filter(msg => msg.metadata?.clips)
                        .flatMap(msg => msg.metadata.clips)
                        .find(clip => clip.id === clipId);
                      
                      if (!clipDetails) return null;
                      
                      return (
                        <div
                          key={`recent-${clipId}`}
                          className="bg-muted/50 rounded-lg p-2 border"
                        >
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                            <span className="text-xs font-medium truncate flex-1">
                              {clipDetails.title}
                            </span>
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            <Badge variant="outline" className="text-xs">
                              {formatTime(clipDetails.startTime)}-{formatTime(clipDetails.endTime)}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              ✅ Ready
                            </Badge>
                          </div>
                        </div>
                      );
                    }).filter(Boolean)
                  ) : (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      Your created clips will appear here
                    </div>
                  )}
                </div>
              </div>

            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsModalOpen} 
        onClose={() => setIsSettingsModalOpen(false)} 
      />
    </div>
  );
}