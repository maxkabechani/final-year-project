import { Download, Smartphone } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export const androidDownloadUrl = 'https://github.com/maxkabechani/final-year-project/releases/latest/download/Smart-Access.apk'
export const iosDownloadUrl = 'https://github.com/maxkabechani/final-year-project/releases/download/ios-latest/Smart-Access.ipa'

export function AppDownloadCard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl space-y-3">
          <div className="flex items-center gap-2 font-semibold">
            <Smartphone className="size-5" aria-hidden="true" />
            Smart Access for Android and iOS
          </div>
          <p className="text-sm text-muted-foreground">
            Download the app for your phone to register it and unlock doors over Bluetooth.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={androidDownloadUrl}>
                <Download aria-hidden="true" /> Android APK
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={iosDownloadUrl}>
                <Download aria-hidden="true" /> iOS IPA
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            iOS 15+ testing builds are unsigned. Import the IPA into AltStore Classic to install it; free Apple ID installs need refreshing every 7 days through AltServer.
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
          <p className="text-xs text-muted-foreground">Scan to download Android APK</p>
        </div>
      </CardContent>
    </Card>
  )
}
