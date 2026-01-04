"use client";

interface ReadAloudCardProps {
  text: string;
  phonetic?: string;
  translation?: string;
  onDismiss: () => void;
}

export function ReadAloudCard({ text, phonetic, translation, onDismiss }: ReadAloudCardProps) {
  return (
    <div className="glass rounded-2xl p-6 text-center">
      <p className="text-xs text-muted-foreground mb-2">Read this aloud:</p>
      <p className="text-xl font-medium text-foreground leading-relaxed">
        {text}
      </p>
      {phonetic && (
        <p className="text-sm text-muted-foreground mt-2 font-mono">
          {phonetic}
        </p>
      )}
      {translation && (
        <p className="text-sm text-muted-foreground/70 mt-1 italic">
          {translation}
        </p>
      )}
      <button
        onClick={onDismiss}
        className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Dismiss
      </button>
    </div>
  );
}

