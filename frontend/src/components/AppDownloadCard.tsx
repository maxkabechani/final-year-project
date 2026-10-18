import { Download, Smartphone } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export const androidDownloadUrl = 'https://github.com/maxkabechani/final-year-project/releases/latest/download/Smart-Access.apk'

export function AppDownloadCard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl space-y-3">
          <div className="flex items-center gap-2 font-semibold">
            <Smartphone className="size-5" aria-hidden="true" />
            Smart Access for Android
          </div>
          <p className="text-sm text-muted-foreground">
            Download the app to register your phone and unlock doors over Bluetooth.
            Scan the QR code with your Android phone or use the download button.
          </p>
          <Button asChild>
            <a href={androidDownloadUrl}>
              <Download aria-hidden="true" /> Download app
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">
            Android APK · Demo build. Your phone may ask you to allow installation from your browser.
          </p>
        </div>
        <div className="shrink-0 space-y-2 text-center">
          <div className="rounded-lg border bg-white p-3">
            <QRCodeSVG
              value={androidDownloadUrl}
              size={144}
              level="M"
              marginSize={4}
              title="Scan to download the Smart Access Android app"
            />
          </div>
          <p className="text-xs text-muted-foreground">Scan to download</p>
        </div>
      </CardContent>
    </Card>
  )
}
