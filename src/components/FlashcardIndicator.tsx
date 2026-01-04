"use client";

import { useState } from "react";

export interface Flashcard {
  id: string;
  concept: string;
  type: "vocabulary" | "grammar" | "phrase";
  context?: string;
  notes?: string;
  createdAt: string; // ISO timestamp for ordering in conversation
}

interface FlashcardIndicatorProps {
  flashcard: Flashcard;
}

export function FlashcardIndicator({ flashcard }: FlashcardIndicatorProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="relative inline-block">
      {/* Hover tooltip with details - positioned ABOVE */}
      {showDetails && (flashcard.context || flashcard.notes) && (
        <div className="absolute left-0 bottom-full mb-2 z-50 w-64 p-3 rounded-lg 
                        bg-popover border border-border shadow-lg text-sm">
          <div className="space-y-2">
            <div className="font-medium text-foreground">{flashcard.concept}</div>
            <div className="text-xs text-muted-foreground capitalize">{flashcard.type}</div>
            {flashcard.context && (
              <div className="text-muted-foreground">
                <span className="text-xs font-medium">Context: </span>
                {flashcard.context}
              </div>
            )}
            {flashcard.notes && (
              <div className="text-muted-foreground">
                <span className="text-xs font-medium">Notes: </span>
                {flashcard.notes}
              </div>
            )}
          </div>
          {/* Arrow pointing down */}
          <div className="absolute left-4 top-full w-0 h-0 
                          border-l-[6px] border-l-transparent 
                          border-r-[6px] border-r-transparent 
                          border-t-[6px] border-t-border" />
          <div className="absolute left-4 top-full w-0 h-0 
                          border-l-[5px] border-l-transparent 
                          border-r-[5px] border-r-transparent 
                          border-t-[5px] border-t-popover"
               style={{ marginTop: "-1px", marginLeft: "1px" }} />
        </div>
      )}

      {/* Flashcard - styled like a physical index card */}
      <div
        className="inline-flex items-center justify-center px-12 py-6 text-sm font-medium
                   bg-primary text-primary-foreground
                   border border-primary/80
                   cursor-pointer transition-all duration-150
                   hover:translate-y-[-1px]"
        style={{
          backgroundImage: "linear-gradient(145deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.1) 25%, transparent 50%, rgba(0,0,0,0.05) 100%)",
          boxShadow: "0 0 16px hsl(75 15% 78% / 0.4), 0 4px 8px rgba(0,0,0,0.1), inset 0 2px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.1)",
        }}
        onMouseEnter={() => setShowDetails(true)}
        onMouseLeave={() => setShowDetails(false)}
      >
        {flashcard.concept}
      </div>
    </div>
  );
}

