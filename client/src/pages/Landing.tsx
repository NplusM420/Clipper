import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Scissors, Download, Zap, Shield, Clock } from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/auth";
  };

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="landing-page">
      {/* Hero Section */}
      <div className="relative">
        {/* Navigation */}
        <nav className="flex items-center justify-between p-6">
          <div className="flex items-center space-x-2">
            <Video className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">Video Clipper</span>
          </div>
          <Button onClick={handleLogin} data-testid="button-login">
            Sign In
          </Button>
        </nav>

        {/* Hero Content */}
        <div className="container mx-auto px-6 py-20">
          <div className="text-center space-y-8">
            <h1 className="text-5xl font-bold tracking-tight">
              Transform Long Videos into
              <span className="text-primary"> Powerful Clips</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Upload your videos, get AI-powered transcriptions, and create professional clips
              with precision timing controls. Perfect for content creators and marketers.
            </p>
            <div className="flex justify-center space-x-4">
              <Button size="lg" onClick={handleLogin} data-testid="button-get-started">
                Get Started Free
              </Button>
              <Button variant="outline" size="lg" data-testid="button-learn-more">
                Learn More
              </Button>
            </div>
          </div>

          {/* Feature Preview */}
          <div className="mt-20">
            <div className="bg-card border border-border rounded-xl p-8 shadow-2xl">
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                <div className="text-center space-y-4">
                  <Video className="h-16 w-16 text-muted-foreground mx-auto" />
                  <p className="text-lg text-muted-foreground">
                    Professional video editing interface with timeline controls
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-20 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">
              Everything you need to create amazing clips
            </h2>
            <p className="text-xl text-muted-foreground">
              Powerful features designed for content creators
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <Zap className="h-10 w-10 text-primary mb-2" />
                <CardTitle>AI Transcription</CardTitle>
                <CardDescription>
                  Automatic transcription using OpenAI Whisper with high accuracy
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• 99%+ accuracy rate</li>
                  <li>• Multiple language support</li>
                  <li>• Editable transcripts</li>
                  <li>• Timestamp synchronization</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Scissors className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Precision Clipping</CardTitle>
                <CardDescription>
                  Create clips with frame-perfect accuracy using timeline controls
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Interactive timeline</li>
                  <li>• Click-to-mark boundaries</li>
                  <li>• Manual timestamp input</li>
                  <li>• Real-time preview</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Download className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Professional Export</CardTitle>
                <CardDescription>
                  Export clips in multiple qualities with optimized compression
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• 1080p, 720p, 480p options</li>
                  <li>• Batch processing</li>
                  <li>• MP4 format</li>
                  <li>• Fast processing</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Clock className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Save Time</CardTitle>
                <CardDescription>
                  Process hours of content in minutes with automated workflows
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Automated transcription</li>
                  <li>• Batch clip creation</li>
                  <li>• Quick export</li>
                  <li>• Organized workflow</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Shield className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Secure & Private</CardTitle>
                <CardDescription>
                  Your content is encrypted and stored securely in the cloud
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Encrypted storage</li>
                  <li>• Private access controls</li>
                  <li>• Auto-cleanup policies</li>
                  <li>• Secure authentication</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Video className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Easy Upload</CardTitle>
                <CardDescription>
                  Drag and drop videos up to 1 hour with progress tracking
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Drag & drop interface</li>
                  <li>• Up to 1 hour videos</li>
                  <li>• 2GB file size limit</li>
                  <li>• Progress tracking</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-20">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to start creating amazing clips?
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Join content creators who are already using Video Clipper to enhance their workflow.
          </p>
          <Button size="lg" onClick={handleLogin} data-testid="button-cta-signup">
            Start Clipping Now
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Video className="h-6 w-6 text-primary" />
              <span className="font-semibold">Video Clipper</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 Video Clipper. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
