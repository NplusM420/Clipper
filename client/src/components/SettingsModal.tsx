import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Key, Eye, EyeOff, TestTube, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

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
  
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (user?.openaiApiKey) {
      setOpenaiApiKey(user.openaiApiKey);
    }
  }, [user]);

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

  const handleResetSettings = () => {
    setOpenaiApiKey("");
    setDefaultQuality("1080p");
    setConcurrentJobs("1");
    setApiTestResult(null);
    
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
        <div className="flex items-center space-x-2 text-accent">
          <div className="w-2 h-2 bg-accent rounded-full" />
          <span className="text-sm">Configured</span>
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
