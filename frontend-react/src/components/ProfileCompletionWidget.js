import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { FileText, Target, Zap, ArrowRight } from "lucide-react";

function ProfileCompletionWidget() {
  const navigate = useNavigate();
  const { user, session } = useUser();
  const [profileData, setProfileData] = useState(null);
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [missingItems, setMissingItems] = useState([]);

  useEffect(() => {
    const fetchProfileData = async () => {
      if (!user?.id || !session?.access_token) return;

      try {
        const response = await fetch(
          "http://localhost:8000/api/v1/user/profile",
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (!response.ok) {
          console.error("Failed to fetch profile");
          return;
        }

        const data = await response.json();
        if (data.success && data.data) {
          const profile = data.data;
          calculateCompletion(profile);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    };

    fetchProfileData();
  }, [user?.id, session?.access_token]);

  const calculateCompletion = (profile) => {
    let completion = 10; // Base 10% for having account + questionnaire
    const missing = [];

    const userProfile = profile.user_profile || {};
    const hasResumeData =
      profile.latest_resume_score !== null &&
      profile.latest_resume_score !== undefined;
    const hasInterests = 
      userProfile.areas_of_interest && 
      Array.isArray(userProfile.areas_of_interest) && 
      userProfile.areas_of_interest.length > 0;
    const hasExpertise = 
      userProfile.expertise && 
      Array.isArray(userProfile.expertise) && 
      userProfile.expertise.length > 0;

    if (hasResumeData) {
      completion += 30;
    } else {
      missing.push({
        key: "resume",
        label: "Upload Your Resume",
        icon: FileText,
        action: () => {
          sessionStorage.setItem("fromDashboard", "true");
          navigate("/upload-resume");
        },
      });
    }

    if (hasInterests) {
      completion += 30;
    } else {
      missing.push({
        key: "interests",
        label: "Add Areas of Interest",
        icon: Target,
        action: () => navigate("/profile"),
      });
    }

    if (hasExpertise) {
      completion += 30;
    } else {
      missing.push({
        key: "expertise",
        label: "Add Skills & Expertise",
        icon: Zap,
        action: () => navigate("/profile"),
      });
    }

    setCompletionPercentage(completion);
    setMissingItems(missing);
  };

  // Only show if not 100% complete
  if (completionPercentage >= 100 || missingItems.length === 0) {
    return null;
  }

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Complete Your Profile</CardTitle>
            <CardDescription className="text-sm">
              {completionPercentage}% complete
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={completionPercentage} className="h-2" />

        <div className="space-y-2">
          {missingItems.slice(0, 2).map((item) => {
            const IconComponent = item.icon;
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <IconComponent className="h-4 w-4 text-primary opacity-70" />
                  <span className="text-sm font-medium text-foreground">
                    {item.label}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={item.action}
                  className="h-6 px-2 text-primary text-xs"
                >
                  Complete
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            );
          })}
        </div>

        {missingItems.length > 2 && (
          <Button
            variant="outline"
            className="w-full text-xs"
            onClick={() => navigate("/profile")}
          >
            View More
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default ProfileCompletionWidget;
