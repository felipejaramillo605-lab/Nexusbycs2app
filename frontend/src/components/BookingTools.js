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
        Comparte enlaces con tus clientes o genera códigos QR para imprimir
      </p>

      <div className="space-y-3">
        {/* Booking Link */}
        <button
          onClick={() => copyLink(bookingUrl, 'Reservas')}
          className="w-full flex items-center justify-between min-h-[44px] px-4 py-3 bg-secondary/30 hover:bg-secondary/50 rounded-xl transition-all group"
        >
          <div className="flex items-center gap-3">
            {copied ? (
              <Check size={20} strokeWidth={1.5} className="text-[#32D74B]" />
            ) : (
              <Link2 size={20} strokeWidth={1.5} className="text-[var(--app-primary)]" />
            )}
            <div className="text-left">
              <p className="text-sm font-medium text-primary">Link de Reservas</p>
              <p className="text-xs text-secondary">Para clientes nuevos (primera cita)</p>
            </div>
          </div>
          <div className="text-xs text-secondary group-hover:text-primary transition-colors">
            Copiar
          </div>
        </button>

        {/* Portal Link */}
        <button
          onClick={() => copyLink(portalUrl, 'Portal del Cliente')}
          className="w-full flex items-center justify-between min-h-[44px] px-4 py-3 bg-secondary/30 hover:bg-secondary/50 rounded-xl transition-all group"
        >
          <div className="flex items-center gap-3">
            {copied ? (
              <Check size={20} strokeWidth={1.5} className="text-[#32D74B]" />
            ) : (
              <User size={20} strokeWidth={1.5} className="text-purple-400" />
            )}
            <div className="text-left">
              <p className="text-sm font-medium text-primary">Link Portal del Cliente</p>
              <p className="text-xs text-secondary">Ver historial y reservar (clientes registrados)</p>
            </div>
          </div>
          <div className="text-xs text-secondary group-hover:text-primary transition-colors">
            Copiar
          </div>
        </button>

        {/* Divider */}
        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[#0A0A0A] px-2 text-zinc-500">Códigos QR</span>
          </div>
        </div>

        {/* Generate QR for Booking */}
        <button
          onClick={() => openQRModal('booking')}
          className="w-full flex items-center justify-between min-h-[44px] px-4 py-3 bg-secondary/30 hover:bg-secondary/50 rounded-xl transition-all group"
        >
          <div className="flex items-center gap-3">
            <QrCode size={20} strokeWidth={1.5} className="text-[var(--app-primary)]" />
            <div className="text-left">
              <p className="text-sm font-medium text-primary">QR Reservas</p>
              <p className="text-xs text-secondary">Para nuevas reservas</p>
            </div>
          </div>
          <div className="text-xs text-secondary group-hover:text-primary transition-colors">
            Generar
          </div>
        </button>

        {/* Generate QR for Portal */}
        <button
          onClick={() => openQRModal('portal')}
          className="w-full flex items-center justify-between min-h-[44px] px-4 py-3 bg-secondary/30 hover:bg-secondary/50 rounded-xl transition-all group"
        >
          <div className="flex items-center gap-3">
            <QrCode size={20} strokeWidth={1.5} className="text-purple-400" />
            <div className="text-left">
              <p className="text-sm font-medium text-primary">QR Portal Cliente</p>
              <p className="text-xs text-secondary">Para historial y reservas</p>
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