import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Share2, Download, Award } from "lucide-react";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { Button } from "@/components/ui/kit";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";
import { trainingService } from "@/lib/services";

export default function GuardCertificate() {
  const { t } = useTranslation();
  const { certificateId } = useParams<{ certificateId: string }>();
  const { data, loading, error, reload } = useAsync(
    () => trainingService.certificate(certificateId),
    [certificateId],
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const share = async () => {
    if (!data) return;
    const url =
      data.publicUrl ||
      (data.downloadToken
        ? `https://cguard-pro.com/public/training/cert/${data.downloadToken}`
        : "");
    const text = t("training.certificate.shareText", { course: data.courseTitle });
    try {
      if (navigator.share) {
        await navigator.share({ title: data.courseTitle, text, url: url || undefined });
        return;
      }
    } catch {
      /* user cancelled or unsupported — fall through to clipboard */
    }
    try {
      await navigator.clipboard?.writeText(url ? `${text} ${url}` : text);
      fb.success();
    } catch {
      /* ignore */
    }
  };

  // "Download" = open the print-ready HTML in its own window and trigger print
  // (browser/native print-to-PDF). No heavy PDF dependency required.
  const download = () => {
    if (!data?.htmlContent) return;
    try {
      const w = window.open("", "_blank");
      if (w) {
        w.document.open();
        w.document.write(data.htmlContent);
        w.document.close();
        setTimeout(() => {
          try {
            w.focus();
            w.print();
          } catch {
            /* ignore */
          }
        }, 400);
        return;
      }
    } catch {
      /* popup blocked — fall back to printing the inline iframe */
    }
    try {
      iframeRef.current?.contentWindow?.focus();
      iframeRef.current?.contentWindow?.print();
    } catch {
      /* ignore */
    }
  };

  return (
    <Screen
      back
      title={t("training.certificate.title")}
      subtitle={t("training.certificate.subtitle")}
    >
      {loading ? (
        <Skeleton className="h-[460px] w-full rounded-card" />
      ) : error && !data ? (
        <ErrorState onRetry={reload} />
      ) : !data?.htmlContent ? (
        <EmptyState
          icon={<Award size={28} />}
          title={t("training.certificate.loadError")}
        />
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-card border border-line bg-white">
            <iframe
              ref={iframeRef}
              title="certificate"
              srcDoc={data.htmlContent}
              className="w-full"
              style={{ height: 460, border: "none" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={share}>
              <span className="flex items-center justify-center gap-2">
                <Share2 size={18} /> {t("training.certificate.share")}
              </span>
            </Button>
            <Button variant="primary" onClick={download}>
              <span className="flex items-center justify-center gap-2">
                <Download size={18} /> {t("training.certificate.download")}
              </span>
            </Button>
          </div>

          <div className="rounded-card border border-line bg-surface-2 p-4 text-xs text-muted">
            <p>
              <span className="text-ink">{data.courseTitle}</span>
            </p>
            <p className="mt-1">
              {t("training.achievements.serial", { serial: data.serialNumber })}
            </p>
          </div>
        </div>
      )}
    </Screen>
  );
}
