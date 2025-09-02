import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SettingsModal } from "@/components/SettingsModal";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // State management
  const [selectedVideo, setSelectedVideo] = useState<VideoType | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize conversation with welcome message
  useEffect(() => {
    if (selectedVideo && messages.length === 0) {
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        sender: 'ai',
        content: `Hi! I'm your AI video assistant. I can see you've selected "${selectedVideo.filename}". What would you like to know about this video? I can help you find specific moments, create viral clips, analyze content, or answer questions about what's discussed.`,
        timestamp: new Date(),
        type: 'text',
      };
      setMessages([welcomeMessage]);
    }
  }, [selectedVideo]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !selectedVideo) return;

    if (!hasOpenRouterKey) {
      toast({
        title: "OpenRouter Not Configured",
        description: "Please configure your OpenRouter API key in Settings first",
        variant: "destructive",
      });
      setIsSettingsModalOpen(true);
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      content: inputMessage,
      timestamp: new Date(),
      type: 'text',
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsTyping(true);

    try {
      // TODO: Replace with actual AI API call
      // Simulate AI response for now
      setTimeout(() => {
        const aiResponse = generateMockResponse(inputMessage, selectedVideo);
        setMessages(prev => [...prev, aiResponse]);
        setIsTyping(false);
      }, 2000);

    } catch (error) {
      setIsTyping(false);
      toast({
        title: "Error",
        description: "Failed to process your message. Please try again.",
        variant: "destructive",
      });
    }
  };

  const generateMockResponse = (userMessage: string, video: VideoType): ChatMessage => {
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('viral') || lowerMessage.includes('clip') || lowerMessage.includes('tiktok') || lowerMessage.includes('social')) {
      return {
        id: Date.now().toString(),
        sender: 'ai',
        content: `I'll analyze "${video.filename}" for viral moments! Let me find the most engaging clips...

I found 3 potential viral clips:

🔥 **"The Game-Changing Moment"** (12:30 - 13:15)
Confidence: 95% | Perfect for TikTok
*This segment has high emotional impact and clear takeaway*

⚡ **"Surprising Revelation"** (25:45 - 26:30) 
Confidence: 88% | Great for YouTube Shorts
*Unexpected insight that will hook viewers*

💡 **"Key Insight Explained"** (41:20 - 42:00)
Confidence: 82% | Ideal for LinkedIn
*Professional content with practical value*

Would you like me to create these clips for you?`,
        timestamp: new Date(),
        type: 'clip_suggestion',
        metadata: {
          clips: [
            { title: "The Game-Changing Moment", startTime: 750, endTime: 795, confidence: 95, platform: "TikTok" },
            { title: "Surprising Revelation", startTime: 1545, endTime: 1590, confidence: 88, platform: "YouTube" },
            { title: "Key Insight Explained", startTime: 2480, endTime: 2520, confidence: 82, platform: "LinkedIn" }
          ]
        }
      };
    }

    if (lowerMessage.includes('about') || lowerMessage.includes('summary') || lowerMessage.includes('topics')) {
      return {
        id: Date.now().toString(),
        sender: 'ai',
        content: `Based on "${video.filename}", here's what I can tell you:

**Duration**: ${Math.floor(video.duration / 60)} minutes

**Main Topics Covered**:
• Introduction and overview (0:00 - 5:00)
• Core concepts and methodology (5:00 - 20:00) 
• Real-world examples and case studies (20:00 - 35:00)
• Advanced techniques (35:00 - 45:00)
• Q&A and wrap-up (45:00 - end)

**Key Speakers**: Based on the audio patterns, there appear to be 2-3 distinct voices

**Content Style**: Professional/Educational with conversational elements

Would you like me to dive deeper into any specific section or topic?`,
        timestamp: new Date(),
        type: 'analysis'
      };
    }

    if (lowerMessage.includes('find') || lowerMessage.includes('where') || lowerMessage.includes('when')) {
      return {
        id: Date.now().toString(),
        sender: 'ai',
        content: `I can search through the entire transcript of "${video.filename}" for you! 

What specific topic, keyword, or phrase would you like me to find? For example:
• "Find where they discuss pricing"
• "When do they mention AI or automation?"  
• "Find the funniest moments"
• "Where do they talk about challenges?"

Just tell me what you're looking for and I'll locate those exact moments with timestamps!`,
        timestamp: new Date(),
        type: 'text'
      };
    }

    // Default response
    return {
      id: Date.now().toString(),
      sender: 'ai',
      content: `I understand you're asking about "${video.filename}". I can help you with:

💬 **Ask questions** about the content
🔍 **Find specific topics** or keywords  
✨ **Create viral clips** for social media
📊 **Analyze and summarize** the content
⏰ **Navigate to specific moments** by time

What would you like to explore first?`,
      timestamp: new Date(),
      type: 'text'
    };
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

                {/* Content Topics */}
                <div className="bg-card rounded-lg p-3 border">
                  <h4 className="font-medium text-sm mb-2">Detected Topics</h4>
                  <div className="space-y-1">
                    <Badge variant="secondary" className="text-xs mr-1 mb-1">AI & Technology</Badge>
                    <Badge variant="secondary" className="text-xs mr-1 mb-1">Business Strategy</Badge>
                    <Badge variant="secondary" className="text-xs mr-1 mb-1">Future Trends</Badge>
                    <Badge variant="secondary" className="text-xs mr-1 mb-1">Industry Insights</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Topics are automatically detected when you chat with the AI
                  </p>
                </div>

                {/* Key Moments */}
                <div className="bg-card rounded-lg p-3 border">
                  <h4 className="font-medium text-sm mb-2">Key Moments</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <span>Introduction</span>
                      <span className="text-muted-foreground">0:00-2:30</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <span>Main Topic</span>
                      <span className="text-muted-foreground">2:30-15:45</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <span>Q&A Session</span>
                      <span className="text-muted-foreground">15:45-{formatTime(selectedVideo.duration)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Ask the AI to find specific moments in your video
                  </p>
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
                            {message.metadata.clips.map((clip, index) => (
                              <Button
                                key={index}
                                variant="outline"
                                size="sm"
                                className="w-full justify-start"
                                onClick={() => {
                                  toast({
                                    title: "Creating Clip",
                                    description: `Creating "${clip.title}" clip...`,
                                  });
                                  // TODO: Implement actual clip creation
                                }}
                              >
                                <Play className="h-4 w-4 mr-2" />
                                Create "{clip.title}"
                                <Badge variant="secondary" className="ml-auto">
                                  {formatTime(clip.startTime)}-{formatTime(clip.endTime)}
                                </Badge>
                              </Button>
                            ))}
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
                          Analyzing your request...
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

              {/* Pending Clips */}
              <div className="bg-card rounded-lg p-3 border">
                <h4 className="font-medium text-sm mb-2">Suggested Clips</h4>
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground text-center py-4">
                    Ask the AI to "create viral clips" to see suggestions here
                  </div>
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

              {/* Recent Clips */}
              <div className="bg-card rounded-lg p-3 border">
                <h4 className="font-medium text-sm mb-2">Recent Clips</h4>
                <div className="space-y-2 text-xs">
                  <div className="text-muted-foreground text-center py-4">
                    Your created clips will appear here
                  </div>
                </div>
              </div>

              {/* Usage Stats */}
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
                    <span>0</span>
                  </div>
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