import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Key, Eye, EyeOff, TestTube, CheckCircle, XCircle, Brain, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<"success" | "error" | null>(null);
  const [defaultQuality, setDefaultQuality] = useState("1080p");
  const [concurrentJobs, setConcurrentJobs] = useState("1");
  const [isSaving, setIsSaving] = useState(false);
  
  // OpenRouter settings
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [isTestingOpenRouter, setIsTestingOpenRouter] = useState(false);
  const [openRouterTestResult, setOpenRouterTestResult] = useState<"success" | "error" | null>(null);
  const [isSavingOpenRouter, setIsSavingOpenRouter] = useState(false);
  const [openRouterConfigured, setOpenRouterConfigured] = useState(false);
  
  // Cloudinary settings
  const [cloudinaryCloudName, setCloudinaryCloudName] = useState("");
  const [cloudinaryApiKey, setCloudinaryApiKey] = useState("");
  const [cloudinaryApiSecret, setCloudinaryApiSecret] = useState("");
  const [showCloudinarySecret, setShowCloudinarySecret] = useState(false);
  const [isTestingCloudinary, setIsTestingCloudinary] = useState(false);
  const [cloudinaryTestResult, setCloudinaryTestResult] = useState<"success" | "error" | null>(null);
  const [isSavingCloudinary, setIsSavingCloudinary] = useState(false);
  const [cloudinaryConfigured, setCloudinaryConfigured] = useState(false);
  
  const { toast } = useToast();
  const { user } = useAuth();

  // AI Model configurations
  const AI_MODELS = {
    SMALL: {
      id: 'google/gemma-3-27b-it',
      name: 'Gemma 27B (Small)',
      contextWindow: 96000,
      specialization: 'Chat Agent',
      description: 'Best for simple content identification and user guidance',
      costTier: 'Most economical',
    },
    MEDIUM: {
      id: 'z-ai/glm-4.5',
      name: 'GLM 4.5 (Medium)',
      contextWindow: 256000,
      specialization: 'Logic & Reasoning Engine',
      description: 'OPTIMAL for clip discovery - superior logical thinking',
      costTier: 'Balanced',
      recommended: true,
    },
    LARGE: {
      id: 'meta-llama/llama-4-maverick',
      name: 'Llama 4 Maverick (Large)',
      contextWindow: 1000000,
      specialization: 'Large Transcript Processor',
      description: 'Best for massive content requiring full context',
      costTier: 'Premium',
    },
  };

  useEffect(() => {
    if (user?.openaiApiKey) {
      setOpenaiApiKey(user.openaiApiKey);
    }
  }, [user]);

  // Load OpenRouter settings
  useEffect(() => {
    const loadOpenRouterSettings = async () => {
      try {
        const res = await fetch("/api/chat/user/openrouter-settings", {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          // Treat 304 or other non-2xx as not configured for safety
          throw new Error(`Failed to load settings: ${res.status}`);
        }
        const response = (await res.json()) as { configured?: boolean };
        if (response?.configured) {
          setOpenRouterConfigured(true);
          // Show placeholder indicating it's configured
          setOpenRouterApiKey(''); // Keep input empty but show it as configured
        } else {
          setOpenRouterConfigured(false);
          setOpenRouterApiKey('');
        }
      } catch (error) {
        // Settings don't exist yet, which is fine
        setOpenRouterConfigured(false);
        setOpenRouterApiKey('');
      }
    };

    if (isOpen) {
      loadOpenRouterSettings();
    }
  }, [isOpen]);

  // Load Cloudinary settings
  useEffect(() => {
    const loadCloudinarySettings = async () => {
      try {
        const res = await fetch("/api/chat/user/cloudinary-settings", {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          throw new Error(`Failed to load settings: ${res.status}`);
        }
        const response = (await res.json()) as { configured?: boolean };
        if (response?.configured) {
          setCloudinaryConfigured(true);
          // Keep input empty but show it as configured
          setCloudinaryCloudName('');
          setCloudinaryApiKey('');
          setCloudinaryApiSecret('');
        } else {
          setCloudinaryConfigured(false);
          setCloudinaryCloudName('');
          setCloudinaryApiKey('');
          setCloudinaryApiSecret('');
        }
      } catch (error) {
        // Settings don't exist yet, which is fine
        setCloudinaryConfigured(false);
        setCloudinaryCloudName('');
        setCloudinaryApiKey('');
        setCloudinaryApiSecret('');
      }
    };

    if (isOpen) {
      loadCloudinarySettings();
    }
  }, [isOpen]);

  const handleSaveApiKey = async () => {
    if (!openaiApiKey.trim()) {
      toast({
        title: "Error",
        description: "Please enter an API key",
        variant: "destructive",
      });
      return;
    }

    if (!openaiApiKey.startsWith('sk-')) {
      toast({
        title: "Error",
        description: "Invalid API key format. OpenAI API keys start with 'sk-'",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await apiRequest("PUT", "/api/settings/openai-key", {
        apiKey: openaiApiKey,
      });

      toast({
        title: "Success",
        description: "API key saved successfully",
      });

      setApiTestResult("success");
    } catch (error) {
      console.error("Failed to save API key:", error);
      toast({
        title: "Error",
        description: "Failed to save API key. Please check the key and try again.",
        variant: "destructive",
      });
      setApiTestResult("error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestApi = async () => {
    if (!openaiApiKey.trim()) {
      toast({
        title: "Error",
        description: "Please enter an API key first",
        variant: "destructive",
      });
      return;
    }

    setIsTestingApi(true);
    setApiTestResult(null);

    try {
      // Test by saving the key first
      await apiRequest("PUT", "/api/settings/openai-key", {
        apiKey: openaiApiKey,
      });

      setApiTestResult("success");
      toast({
        title: "Success",
        description: "API key is valid and working",
      });
    } catch (error) {
      setApiTestResult("error");
      toast({
        title: "Error",
        description: "API key test failed. Please check your key.",
        variant: "destructive",
      });
    } finally {
      setIsTestingApi(false);
    }
  };

  // OpenRouter functions
  const handleSaveOpenRouterKey = async () => {
    if (!openRouterApiKey.trim()) {
      toast({
        title: "Error",
        description: "Please enter an OpenRouter API key",
        variant: "destructive",
      });
      return;
    }

    if (!openRouterApiKey.startsWith('sk-or-')) {
      toast({
        title: "Error", 
        description: "Invalid API key format. OpenRouter API keys start with 'sk-or-'",
        variant: "destructive",
      });
      return;
    }

    setIsSavingOpenRouter(true);
    try {
      await apiRequest("POST", "/api/chat/user/openrouter-settings", {
        apiKey: openRouterApiKey,
      });

      toast({
        title: "Success",
        description: "OpenRouter settings saved successfully",
      });

      setOpenRouterConfigured(true);
      setOpenRouterTestResult("success");
      // Ensure any consumers (like AI Dashboard) see the updated status
      queryClient.invalidateQueries({ queryKey: ["/api/chat/user/openrouter-settings"] });
    } catch (error) {
      console.error("Failed to save OpenRouter settings:", error);
      toast({
        title: "Error",
        description: "Failed to save OpenRouter settings. Please try again.",
        variant: "destructive",
      });
      setOpenRouterTestResult("error");
    } finally {
      setIsSavingOpenRouter(false);
    }
  };

  const handleTestOpenRouter = async () => {
    if (!openRouterApiKey.trim()) {
      toast({
        title: "Error",
        description: "Please enter an OpenRouter API key first",
        variant: "destructive",
      });
      return;
    }

    setIsTestingOpenRouter(true);
    setOpenRouterTestResult(null);

    try {
      // Test the API key by saving it first
      await apiRequest("POST", "/api/chat/user/openrouter-settings", {
        apiKey: openRouterApiKey,
      });

      setOpenRouterConfigured(true);
      setOpenRouterTestResult("success");
      toast({
        title: "Success",
        description: "OpenRouter API key is valid and working",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/user/openrouter-settings"] });
    } catch (error) {
      setOpenRouterTestResult("error");
      toast({
        title: "Error",
        description: "OpenRouter API key test failed. Please check your key.",
        variant: "destructive",
      });
    } finally {
      setIsTestingOpenRouter(false);
    }
  };

  // Cloudinary functions
  const handleSaveCloudinarySettings = async () => {
    if (!cloudinaryCloudName.trim() || !cloudinaryApiKey.trim() || !cloudinaryApiSecret.trim()) {
      toast({
        title: "Error",
        description: "Please enter all Cloudinary credentials",
        variant: "destructive",
      });
      return;
    }

    setIsSavingCloudinary(true);
    try {
      await apiRequest("POST", "/api/chat/user/cloudinary-settings", {
        cloudName: cloudinaryCloudName,
        apiKey: cloudinaryApiKey,
        apiSecret: cloudinaryApiSecret,
      });

      toast({
        title: "Success",
        description: "Cloudinary settings saved successfully",
      });

      setCloudinaryConfigured(true);
      setCloudinaryTestResult("success");
      queryClient.invalidateQueries({ queryKey: ["/api/chat/user/cloudinary-settings"] });
    } catch (error) {
      console.error("Failed to save Cloudinary settings:", error);
      toast({
        title: "Error",
        description: "Failed to save Cloudinary settings. Please check your credentials and try again.",
        variant: "destructive",
      });
      setCloudinaryTestResult("error");
    } finally {
      setIsSavingCloudinary(false);
    }
  };

  const handleTestCloudinary = async () => {
    if (!cloudinaryCloudName.trim() || !cloudinaryApiKey.trim() || !cloudinaryApiSecret.trim()) {
      toast({
        title: "Error",
        description: "Please enter all Cloudinary credentials first",
        variant: "destructive",
      });
      return;
    }

    setIsTestingCloudinary(true);
    setCloudinaryTestResult(null);

    try {
      // Test the credentials by saving them first
      await apiRequest("POST", "/api/chat/user/cloudinary-settings", {
        cloudName: cloudinaryCloudName,
        apiKey: cloudinaryApiKey,
        apiSecret: cloudinaryApiSecret,
      });

      setCloudinaryConfigured(true);
      setCloudinaryTestResult("success");
      toast({
        title: "Success",
        description: "Cloudinary credentials are valid and working",
      });
    } catch (error) {
      setCloudinaryTestResult("error");
      toast({
        title: "Error",
        description: "Cloudinary credentials test failed. Please check your credentials.",
        variant: "destructive",
      });
    } finally {
      setIsTestingCloudinary(false);
    }
  };

  const handleResetSettings = () => {
    setOpenaiApiKey("");
    setDefaultQuality("1080p");
    setConcurrentJobs("1");
    setApiTestResult(null);
    setOpenRouterApiKey("");
    setOpenRouterTestResult(null);
    setOpenRouterConfigured(false);
    setCloudinaryCloudName("");
    setCloudinaryApiKey("");
    setCloudinaryApiSecret("");
    setCloudinaryTestResult(null);
    setCloudinaryConfigured(false);
    
    toast({
      title: "Settings Reset",
      description: "All settings have been reset to defaults",
    });
  };

  const renderApiStatus = () => {
    if (apiTestResult === "success") {
      return (
        <div className="flex items-center space-x-2 text-green-400">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm">Connected</span>
        </div>
      );
    } else if (apiTestResult === "error") {
      return (
        <div className="flex items-center space-x-2 text-destructive">
          <XCircle className="h-4 w-4" />
          <span className="text-sm">Connection Failed</span>
        </div>
      );
    } else if (user?.openaiApiKey) {
      return (
        <div className="flex items-center space-x-2 text-green-400">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Credentials Saved</span>
          <Badge variant="secondary" className="ml-1">Ready</Badge>
        </div>
      );
    } else {
      return (
        <div className="flex items-center space-x-2 text-muted-foreground">
          <div className="w-2 h-2 bg-muted-foreground rounded-full" />
          <span className="text-sm">Not Configured</span>
        </div>
      );
    }
  };

  const renderOpenRouterStatus = () => {
    if (openRouterTestResult === "success") {
      return (
        <div className="flex items-center space-x-2 text-green-400">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm">Connected</span>
        </div>
      );
    } else if (openRouterTestResult === "error") {
      return (
        <div className="flex items-center space-x-2 text-destructive">
          <XCircle className="h-4 w-4" />
          <span className="text-sm">Connection Failed</span>
        </div>
      );
    } else if (openRouterConfigured) {
      return (
        <div className="flex items-center space-x-2 text-green-400">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Credentials Saved</span>
          <Badge variant="secondary" className="ml-1">Ready</Badge>
        </div>
      );
    } else {
      return (
        <div className="flex items-center space-x-2 text-muted-foreground">
          <div className="w-2 h-2 bg-muted-foreground rounded-full" />
          <span className="text-sm">Not Configured</span>
        </div>
      );
    }
  };

  const renderCloudinaryStatus = () => {
    if (cloudinaryTestResult === "success") {
      return (
        <div className="flex items-center space-x-2 text-green-400">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm">Connected</span>
        </div>
      );
    } else if (cloudinaryTestResult === "error") {
      return (
        <div className="flex items-center space-x-2 text-destructive">
          <XCircle className="h-4 w-4" />
          <span className="text-sm">Connection Failed</span>
        </div>
      );
    } else if (cloudinaryConfigured) {
      return (
        <div className="flex items-center space-x-2 text-green-400">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Credentials Saved</span>
          <Badge variant="secondary" className="ml-1">Ready</Badge>
        </div>
      );
    } else {
      return (
        <div className="flex items-center space-x-2 text-muted-foreground">
          <div className="w-2 h-2 bg-muted-foreground rounded-full" />
          <span className="text-sm">Not Configured</span>
        </div>
      );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="settings-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="api" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="api" data-testid="tab-api">API Configuration</TabsTrigger>
            <TabsTrigger value="export" data-testid="tab-export">Export Settings</TabsTrigger>
            <TabsTrigger value="storage" data-testid="tab-storage">Storage</TabsTrigger>
            <TabsTrigger value="account" data-testid="tab-account">Account</TabsTrigger>
          </TabsList>

          {/* API Configuration */}
          <TabsContent value="api" className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">API Configuration</h3>
              
              {/* OpenAI API Section */}
              <div className="bg-muted rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Key className="h-4 w-4 text-primary" />
                    <span className="font-medium">OpenAI Whisper API</span>
                  </div>
                  {renderApiStatus()}
                </div>
                <p className="text-sm text-muted-foreground">
                  Required for video transcription. Your API key is encrypted and stored securely.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="openaiKey">OpenAI API Key</Label>
                  <div className="relative mt-1">
                    <Input
                      id="openaiKey"
                      type={showApiKey ? "text" : "password"}
                      placeholder="sk-..."
                      value={openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      className="pr-10"
                      data-testid="input-openai-key"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                      onClick={() => setShowApiKey(!showApiKey)}
                      data-testid="button-toggle-api-key-visibility"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Get your API key from{" "}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      OpenAI Platform
                    </a>
                  </p>
                </div>

                <div className="flex space-x-3">
                  <Button
                    onClick={handleTestApi}
                    disabled={isTestingApi || !openaiApiKey.trim()}
                    variant="outline"
                    data-testid="button-test-api"
                  >
                    <TestTube className="h-4 w-4 mr-2" />
                    {isTestingApi ? "Testing..." : "Test Connection"}
                  </Button>
                  
                  <Button
                    onClick={handleSaveApiKey}
                    disabled={isSaving || !openaiApiKey.trim()}
                    data-testid="button-save-api-key"
                  >
                    {isSaving ? "Saving..." : "Save API Key"}
                  </Button>
                </div>
              </div>
            </div>

            {/* OpenRouter AI Section */}
            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-4">AI Clip Discovery</h3>
              
              {/* OpenRouter API Section */}
              <div className="bg-muted rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Brain className="h-4 w-4 text-primary" />
                    <span className="font-medium">OpenRouter API</span>
                  </div>
                  {renderOpenRouterStatus()}
                </div>
                <p className="text-sm text-muted-foreground">
                  Required for AI-powered clip discovery. Uses your own OpenRouter API key for cost transparency.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="openrouterKey">OpenRouter API Key</Label>
                  <div className="relative mt-1">
                    <Input
                      id="openrouterKey"
                      type={showOpenRouterKey ? "text" : "password"}
                      placeholder={openRouterConfigured ? "API key configured (enter new key to update)" : "sk-or-..."}
                      value={openRouterApiKey}
                      onChange={(e) => setOpenRouterApiKey(e.target.value)}
                      className="pr-10"
                      data-testid="input-openrouter-key"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                      onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                      data-testid="button-toggle-openrouter-key-visibility"
                    >
                      {showOpenRouterKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Get your API key from{" "}
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      OpenRouter Platform
                    </a>
                  </p>
                </div>

                {/* AI Model Orchestration Information */}
                <div>
                  <Label>AI Model Orchestration</Label>
                  <div className="bg-muted/50 rounded-lg p-3 mt-1">
                    <p className="text-sm text-muted-foreground mb-3">
                      Your AI assistant automatically uses three specialized models based on what you request:
                    </p>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>
                        <div>
                          <div className="font-medium">Conversation (Gemma 27B)</div>
                          <div className="text-muted-foreground">Handles all chat interactions and coordinates other models</div>
                        </div>
                      </div>
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                        <div>
                          <div className="font-medium">Clip Analysis (GLM 4.5)</div>
                          <div className="text-muted-foreground">Automatically finds viral moments when you request clips</div>
                        </div>
                      </div>
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-purple-500 rounded-full mt-1.5 flex-shrink-0"></div>
                        <div>
                          <div className="font-medium">Deep Analysis (Llama 4 Maverick)</div>
                          <div className="text-muted-foreground">Handles complex content questions and long transcripts</div>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      No manual configuration needed - the AI chooses the right model automatically!
                    </p>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <Button
                    onClick={handleTestOpenRouter}
                    disabled={isTestingOpenRouter || !openRouterApiKey.trim()}
                    variant="outline"
                    data-testid="button-test-openrouter"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    {isTestingOpenRouter ? "Testing..." : "Test Connection"}
                  </Button>
                  
                  <Button
                    onClick={handleSaveOpenRouterKey}
                    disabled={isSavingOpenRouter || !openRouterApiKey.trim()}
                    data-testid="button-save-openrouter-key"
                  >
                    {isSavingOpenRouter ? "Saving..." : "Save Settings"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Cloudinary Storage Section */}
            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-4">Video Storage</h3>
              
              {/* Cloudinary Settings */}
              <div className="bg-muted rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl">☁️</span>
                    <span className="font-medium">Cloudinary Storage</span>
                  </div>
                  {renderCloudinaryStatus()}
                </div>
                <p className="text-sm text-muted-foreground">
                  Use your own Cloudinary account for video storage and processing. Falls back to system defaults if not configured.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="cloudinaryCloudName">Cloud Name</Label>
                  <Input
                    id="cloudinaryCloudName"
                    type="text"
                    placeholder={cloudinaryConfigured ? "Cloud name configured (enter new to update)" : "your-cloud-name"}
                    value={cloudinaryCloudName}
                    onChange={(e) => setCloudinaryCloudName(e.target.value)}
                    className="mt-1"
                    data-testid="input-cloudinary-cloud-name"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Found in your Cloudinary dashboard under "Account Details"
                  </p>
                </div>

                <div>
                  <Label htmlFor="cloudinaryApiKey">API Key</Label>
                  <Input
                    id="cloudinaryApiKey"
                    type="text"
                    placeholder={cloudinaryConfigured ? "API key configured (enter new to update)" : "123456789012345"}
                    value={cloudinaryApiKey}
                    onChange={(e) => setCloudinaryApiKey(e.target.value)}
                    className="mt-1"
                    data-testid="input-cloudinary-api-key"
                  />
                </div>

                <div>
                  <Label htmlFor="cloudinaryApiSecret">API Secret</Label>
                  <div className="relative mt-1">
                    <Input
                      id="cloudinaryApiSecret"
                      type={showCloudinarySecret ? "text" : "password"}
                      placeholder={cloudinaryConfigured ? "API secret configured (enter new to update)" : "abcdefghijk_lmnopqrstuv-wxyz123456"}
                      value={cloudinaryApiSecret}
                      onChange={(e) => setCloudinaryApiSecret(e.target.value)}
                      className="pr-10"
                      data-testid="input-cloudinary-api-secret"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                      onClick={() => setShowCloudinarySecret(!showCloudinarySecret)}
                      data-testid="button-toggle-cloudinary-secret-visibility"
                    >
                      {showCloudinarySecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Get your credentials from{" "}
                    <a
                      href="https://cloudinary.com/console"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Cloudinary Console
                    </a>
                  </p>
                </div>

                <div className="flex space-x-3">
                  <Button
                    onClick={handleTestCloudinary}
                    disabled={isTestingCloudinary || !cloudinaryCloudName.trim() || !cloudinaryApiKey.trim() || !cloudinaryApiSecret.trim()}
                    variant="outline"
                    data-testid="button-test-cloudinary"
                  >
                    <TestTube className="h-4 w-4 mr-2" />
                    {isTestingCloudinary ? "Testing..." : "Test Connection"}
                  </Button>
                  
                  <Button
                    onClick={handleSaveCloudinarySettings}
                    disabled={isSavingCloudinary || !cloudinaryCloudName.trim() || !cloudinaryApiKey.trim() || !cloudinaryApiSecret.trim()}
                    data-testid="button-save-cloudinary-settings"
                  >
                    {isSavingCloudinary ? "Saving..." : "Save Settings"}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Export Settings */}
          <TabsContent value="export" className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Export Settings</h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="defaultQuality">Default Quality</Label>
                  <select
                    id="defaultQuality"
                    value={defaultQuality}
                    onChange={(e) => setDefaultQuality(e.target.value)}
                    className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring mt-1"
                    data-testid="select-default-quality"
                  >
                    <option value="1080p">1080p (High Quality)</option>
                    <option value="720p">720p (Medium Quality)</option>
                    <option value="480p">480p (Low Quality)</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="concurrentJobs">Concurrent Processing Jobs</Label>
                  <select
                    id="concurrentJobs"
                    value={concurrentJobs}
                    onChange={(e) => setConcurrentJobs(e.target.value)}
                    className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring mt-1"
                    data-testid="select-concurrent-jobs"
                  >
                    <option value="1">1 (Recommended)</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Higher values may impact performance
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Storage Management */}
          <TabsContent value="storage" className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Storage Management</h3>
              
              <div className="bg-muted rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Storage Usage</span>
                  <Badge variant="outline">2.3GB / 5GB</Badge>
                </div>
                <div className="w-full bg-border rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: "46%" }}></div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-card border border-border rounded-lg p-4">
                  <h4 className="font-medium mb-2">Cleanup Policy</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Processed clips are automatically deleted after 7 days to save storage space.
                    Original videos are preserved.
                  </p>
                  <Button variant="outline" size="sm" data-testid="button-cleanup-now">
                    Run Cleanup Now
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Account */}
          <TabsContent value="account" className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Account Information</h3>
              
              <div className="space-y-4">
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center space-x-4">
                    {user?.profileImageUrl && (
                      <img
                        src={user.profileImageUrl}
                        alt="Profile"
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    )}
                    <div>
                      <p className="font-medium">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <h4 className="font-medium mb-2">Account Status</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Videos Processed</span>
                      <span className="text-muted-foreground">12</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Clips Created</span>
                      <span className="text-muted-foreground">45</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Member Since</span>
                      <span className="text-muted-foreground">
                        {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Unknown"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer Actions */}
        <div className="flex justify-between pt-6 border-t border-border">
          <Button
            variant="outline"
            onClick={handleResetSettings}
            data-testid="button-reset-settings"
          >
            Reset to Defaults
          </Button>
          <div className="flex space-x-3">
            <Button variant="outline" onClick={onClose} data-testid="button-close-settings">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
