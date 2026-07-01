import React, { useState } from 'react';
import { Link2, QrCode, Check, X } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';

const BookingTools = ({ organizationId }) => {
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

  const bookingUrl = `${window.location.origin}/book/${organizationId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    toast.success('¡Link copiado al portapapeles!');
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQR = () => {
    const canvas = document.getElementById('qr-code-canvas');
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `qr-reservas-${organizationId}.png`;
      link.href = url;
      link.click();
      toast.success('¡Código QR descargado!');
    }
  };

  return (
    <div className="glass-panel p-6 rounded-2xl">
      <h3 className="text-lg font-medium text-primary mb-4">Herramientas de Reserva</h3>
      <p className="text-sm text-secondary mb-6">
        Comparte el link de reservas con tus clientes o genera un código QR para imprimir
      </p>

      <div className="space-y-3">
        {/* Copy Link Button */}
        <button
          onClick={copyLink}
          className="w-full flex items-center justify-between min-h-[44px] px-4 py-3 bg-secondary/30 hover:bg-secondary/50 rounded-xl transition-all group"
        >
          <div className="flex items-center gap-3">
            {copied ? (
              <Check size={20} strokeWidth={1.5} className="text-[#32D74B]" />
            ) : (
              <Link2 size={20} strokeWidth={1.5} className="text-[#0A84FF]" />
            )}
            <div className="text-left">
              <p className="text-sm font-medium text-primary">Copiar Link de Reservas</p>
              <p className="text-xs text-secondary truncate max-w-[300px]">{bookingUrl}</p>
            </div>
          </div>
          <div className="text-xs text-secondary group-hover:text-primary transition-colors">
            {copied ? 'Copiado!' : 'Copiar'}
          </div>
        </button>

        {/* Generate QR Button */}
        <button
          onClick={() => setShowQR(true)}
          className="w-full flex items-center justify-between min-h-[44px] px-4 py-3 bg-secondary/30 hover:bg-secondary/50 rounded-xl transition-all group"
        >
          <div className="flex items-center gap-3">
            <QrCode size={20} strokeWidth={1.5} className="text-[#0A84FF]" />
            <div className="text-left">
              <p className="text-sm font-medium text-primary">Generar Código QR</p>
              <p className="text-xs text-secondary">Para imprimir o compartir</p>
            </div>
          </div>
          <div className="text-xs text-secondary group-hover:text-primary transition-colors">
            Generar
          </div>
        </button>
      </div>

      {/* QR Modal */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="bg-primary border-primary/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-primary flex items-center gap-2">
              <QrCode size={24} strokeWidth={1.5} className="text-[#0A84FF]" />
              Código QR de Reservas
            </DialogTitle>
          </DialogHeader>
          <div className="mt-6 space-y-6">
            <div className="flex justify-center p-6 bg-white rounded-2xl">
              <QRCodeCanvas
                id="qr-code-canvas"
                value={bookingUrl}
                size={256}
                level="H"
                includeMargin={true}
              />
            </div>
            
            <div className="bg-secondary/30 rounded-xl p-4">
              <p className="text-xs text-secondary mb-2">URL de Reservas:</p>
              <p className="text-sm text-primary font-mono break-all">{bookingUrl}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={downloadQR}
                className="flex-1 min-h-[44px] px-4 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all"
              >
                Descargar QR
              </button>
              <button
                onClick={() => setShowQR(false)}
                className="min-h-[44px] px-4 py-3 bg-secondary/30 hover:bg-secondary/50 text-primary rounded-xl transition-all"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>

            <p className="text-xs text-secondary text-center">
              Los clientes pueden escanear este código QR para acceder directamente a la página de reservas
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BookingTools;
