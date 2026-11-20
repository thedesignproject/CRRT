import { useId, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "../lib/utils";

type UploadDropzoneProps = {
  onFile?: (file: File) => void;
  className?: string;
};

const isHtml = (file: File) => file.type === "text/html" || /\.html?$/i.test(file.name);

/** Plan B without a repo: drop an HTML file, get a review link. */
export function UploadDropzone({ onFile, className }: UploadDropzoneProps) {
  const id = useId();
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  // The picker filters by `accept`, but a drop doesn't, so check both paths the same way.
  function take(file: File | undefined) {
    if (!file) return;
    if (!isHtml(file)) {
      setRejected(file.name);
      return;
    }
    setRejected(null);
    onFile?.(file);
  }

  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        // Moving onto a child fires dragleave on the label too; only clear when leaving it.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files[0]);
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
      {rejected && (
        <span role="alert" className="text-[13px] text-destructive">
          {rejected} isn’t an HTML file.
        </span>
      )}
      <input
        id={id}
        type="file"
        accept=".html,text/html"
        className="sr-only"
        onChange={(e) => {
          take(e.target.files?.[0]);
        }}
      />
    </label>
  );
}
