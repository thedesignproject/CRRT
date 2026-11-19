import { useId, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "../lib/utils";

type UploadDropzoneProps = {
  onFile?: (file: File) => void;
  className?: string;
};

/** Plan B without a repo: drop an HTML file, get a review link. */
export function UploadDropzone({ onFile, className }: UploadDropzoneProps) {
  const id = useId();
  const [over, setOver] = useState(false);

  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile?.(file);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-[1.5px] border-dashed p-7 text-center text-text-subtle transition-colors focus-within:ring-2 focus-within:ring-ring",
        over ? "border-carrot bg-surface-3" : "border-agent-idle hover:border-text-subtle",
        className
      )}
    >
      <Upload aria-hidden="true" className="size-5 text-text-body" />
      <span className="font-medium text-text-strong">Drop an HTML file</span>
      <span className="text-[13px]">Get a review link in two seconds, no repo needed.</span>
      <input
        id={id}
        type="file"
        accept=".html,text/html"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile?.(file);
        }}
      />
    </label>
  );
}
