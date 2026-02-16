// src/components/MockInterview.js
import React from "react";
import { MessageSquare, Clock } from "lucide-react";

function MockInterview({ resumeData }) {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Mock Interview</h2>
        {resumeData ? (
          <p className="text-muted-foreground mb-4">
            Preparing questions based on: <strong className="text-foreground">{resumeData.filename}</strong>
          </p>
        ) : (
          <p className="text-muted-foreground mb-4">No resume uploaded yet.</p>
        )}

        <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-600 px-4 py-2 rounded-full text-sm font-medium">
          <Clock className="w-4 h-4" />
          Coming Soon...
        </div>
      </div>
    </div>
  );
}

export default MockInterview;
