"use client";

import { useState } from "react";
import { CloseIcon } from "./ui/icons";

export interface Flashcard {
  id: string;
  concept: string;
  type: "vocabulary" | "grammar" | "phrase";
  context?: string;
  notes?: string;
  createdAt: string; // ISO timestamp for ordering in conversation
  afterMessageIndex: number; // Position in conversation (show after this message)
}

interface FlashcardIndicatorProps {
  flashcard: Flashcard;
  onDelete?: (id: string) => void;
}

export function FlashcardIndicator({ flashcard, onDelete }: FlashcardIndicatorProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className="relative inline-block animate-in zoom-in-95 fade-in duration-300"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setShowDetails(false); }}
    >
      {/* Hover tooltip with details - positioned ABOVE */}
      {showDetails && (flashcard.context || flashcard.notes) && (
        <div className="absolute left-0 bottom-full mb-2 z-50 w-64 p-3 rounded-lg 
                        bg-popover border border-border shadow-lg text-sm
                        animate-in fade-in slide-in-from-bottom-2 duration-200">
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
        data-flashcard
        className="relative inline-flex items-center justify-center px-6 py-3 text-sm font-medium
                   bg-primary/80 text-primary-foreground
                   border border-primary
                   cursor-pointer transition-all duration-150
                   hover:translate-y-[-1px]"
        style={{
          backgroundImage: "linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 25%, transparent 50%, rgba(0,0,0,0.05) 100%)",
          boxShadow: "0 0 12px hsl(var(--primary) / 0.25), 0 2px 6px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)",
        }}
        onMouseEnter={() => setShowDetails(true)}
      >
        {flashcard.concept}
        
        {/* Delete button - top right corner, shows on hover */}
        {isHovered && onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(flashcard.id);
            }}
            className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full 
                       bg-neutral-600 hover:bg-neutral-800 text-neutral-300 hover:text-neutral-100
                       transition-colors duration-150"
            title="Remove flashcard"
          >
            <CloseIcon className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
    </div>
  );
}

