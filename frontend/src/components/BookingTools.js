import React, { useState } from 'react';
import { Link2, QrCode, Check, X, User } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';

const BookingTools = ({ organizationId }) => {
  const [showQR, setShowQR] = useState(false);
  const [qrType, setQrType] = useState('booking'); // 'booking' or 'portal'
  const [copied, setCopied] = useState(false);

  const bookingUrl = `${window.location.origin}/book/${organizationId}`;
  const portalUrl = `${window.location.origin}/portal/${organizationId}`;

  const copyLink = (url, label) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success(`¡Link de ${label} copiado!`);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQR = () => {
    const canvas = document.getElementById('qr-code-canvas');
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `qr-${qrType}-${organizationId}.png`;
      link.href = url;
      link.click();
      toast.success('¡Código QR descargado!');
    }
  };

  const openQRModal = (type) => {
    setQrType(type);
    setShowQR(true);
  };

  const currentUrl = qrType === 'booking' ? bookingUrl : portalUrl;
  const currentLabel = qrType === 'booking' ? 'Reservas' : 'Portal del Cliente';

  return (
    <div className="glass-panel p-6 rounded-2xl">
      <h3 className="text-lg font-medium text-primary mb-4">Herramientas para Clientes</h3>
      <p className="text-sm text-secondary mb-6">
        Comparte el enlace o el código QR según lo que necesite tu cliente
      </p>

      <div className="space-y-3">
        {/* Reservas: link + QR together, one clear group */}
        <div className="p-4 bg-secondary/30 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <Link2 size={20} strokeWidth={1.5} className="text-[var(--app-primary)]" />
            <div>
              <p className="text-sm font-medium text-primary">Reservas</p>
              <p className="text-xs text-secondary">Para clientes nuevos (primera cita)</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              data-testid="booking-tools-copy-booking-link"
              onClick={() => copyLink(bookingUrl, 'Reservas')}
              className="flex-1 min-h-[40px] px-3 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-primary transition-all flex items-center justify-center gap-2"
            >
              {copied ? <Check size={16} className="text-[#32D74B]" /> : <Link2 size={16} />} Copiar link
            </button>
            <button
              data-testid="booking-tools-qr-booking"
              onClick={() => openQRModal('booking')}
              className="min-h-[40px] px-3 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-primary transition-all flex items-center justify-center gap-2"
            >
              <QrCode size={16} /> QR
            </button>
          </div>
        </div>

        {/* Portal del Cliente: link + QR together */}
        <div className="p-4 bg-secondary/30 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <User size={20} strokeWidth={1.5} className="text-purple-400" />
            <div>
              <p className="text-sm font-medium text-primary">Portal del Cliente</p>
              <p className="text-xs text-secondary">Ver historial y reservar (clientes registrados)</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              data-testid="booking-tools-copy-portal-link"
              onClick={() => copyLink(portalUrl, 'Portal del Cliente')}
              className="flex-1 min-h-[40px] px-3 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-primary transition-all flex items-center justify-center gap-2"
            >
              {copied ? <Check size={16} className="text-[#32D74B]" /> : <Link2 size={16} />} Copiar link
            </button>
            <button
              data-testid="booking-tools-qr-portal"
              onClick={() => openQRModal('portal')}
              className="min-h-[40px] px-3 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-primary transition-all flex items-center justify-center gap-2"
            >
              <QrCode size={16} /> QR
            </button>
          </div>
        </div>
      </div>

      {/* QR Modal */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="bg-primary border-primary/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-primary flex items-center gap-2">
              <QrCode size={24} strokeWidth={1.5} className={qrType === 'booking' ? 'text-[var(--app-primary)]' : 'text-purple-400'} />
              Código QR de {currentLabel}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-6 space-y-6">
            <div className="flex justify-center p-6 bg-white rounded-2xl">
              <QRCodeCanvas
                id="qr-code-canvas"
                value={currentUrl}
                size={256}
                level="H"
                includeMargin={true}
              />
            </div>
            
            <div className="bg-secondary/30 rounded-xl p-4">
              <p className="text-xs text-secondary mb-2">URL de {currentLabel}:</p>
              <p className="text-sm text-primary font-mono break-all">{currentUrl}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={downloadQR}
                className={`flex-1 min-h-[44px] px-4 py-3 ${
                  qrType === 'booking' 
                    ? 'bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)]' 
                    : 'bg-purple-500 hover:bg-purple-600'
                } text-white rounded-xl font-medium transition-all`}
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
              {qrType === 'booking' 
                ? 'Los clientes pueden escanear este código QR para hacer una nueva reserva'
                : 'Los clientes pueden escanear este código QR para acceder a su portal personal e historial'
              }
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BookingTools;