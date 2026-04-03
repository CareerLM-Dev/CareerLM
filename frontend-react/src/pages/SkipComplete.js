import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { ArrowRight, CheckCircle, FileText, Target, Zap } from "lucide-react";

function SkipComplete() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const { session } = useUser();

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-primary">
      <div className="min-h-full flex items-center justify-center py-4 px-5">
        <div className="w-full max-w-2xl">
          <Card className="bg-card/95 backdrop-blur-xl border-border/20 shadow-2xl">
            <CardHeader className="text-center space-y-1 pt-6 pb-4">
              <div className="flex justify-center mb-3">
                <div className="inline-flex items-center justify-center rounded-full bg-green-500/10 p-3">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </div>
              <CardTitle className="text-3xl font-bold text-primary">
                You're Almost There!
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Let's get your profile 10% complete to unlock all features
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground text-center mb-4">
                Complete these quick steps to unlock personalized recommendations:
              </p>

              {/* Profile Completion Items */}
              <div className="grid gap-3">
                {/* Resume Upload */}
                <div
                  onClick={() => {
                    sessionStorage.setItem("fromOnboarding", "true");
                    navigate("/dashboard/resume-analyzer");
                  }}
                  className="flex items-start gap-3 p-3 border border-border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors group"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="flex items-center justify-center rounded-md bg-primary/10 group-hover:bg-primary/20 p-2">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm text-foreground">
                      Upload Your Resume
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Get instant ATS scoring and personalized improvements
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary flex-shrink-0 mt-0.5" />
                </div>

                {/* Areas of Interest */}
                <div
                  onClick={() => navigate("/profile")}
                  className="flex items-start gap-3 p-3 border border-border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors group"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="flex items-center justify-center rounded-md bg-primary/10 group-hover:bg-primary/20 p-2">
                      <Target className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm text-foreground">
                      Add Areas of Interest
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Tell us what interests you to get relevant job matches
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary flex-shrink-0 mt-0.5" />
                </div>

                {/* Skills & Expertise */}
                <div
                  onClick={() => navigate("/profile")}
                  className="flex items-start gap-3 p-3 border border-border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors group"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="flex items-center justify-center rounded-md bg-primary/10 group-hover:bg-primary/20 p-2">
                      <Zap className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm text-foreground">
                      Add Your Skills & Expertise
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Help us create a personalized learning plan
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary flex-shrink-0 mt-0.5" />
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center pt-2">
                You can complete these anytime from your dashboard
              </p>
            </CardContent>

            <CardFooter className="border-t border-border pt-4">
              <Button
                onClick={() => navigate("/home")}
                className="w-full shadow-md shadow-primary/30"
              >
                Go to Dashboard
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default SkipComplete;
