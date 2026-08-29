import React from 'react';
import { Info } from 'lucide-react';

/**
 * Marketing Consent Checkbox Component
 * Complies with TCPA, CAN-SPAM Act, and Ley 1581/2012 (Colombia)
 * 
 * Features:
 * - Optional (unchecked by default)
 * - Clear separation between transactional and marketing messages
 * - Link to Privacy Policy
 */
export default function MarketingConsentCheckbox({ 
  checked, 
  onChange, 
  showInfo = true,
  privacyPolicyUrl = "/privacy-policy"
}) {
  return (
    <div className="marketing-consent-wrapper">
      <label className="marketing-consent-label">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="marketing-consent-checkbox"
        />
        <span className="marketing-consent-text">
          <strong>Acepto recibir promociones y novedades</strong> por correo electrónico y WhatsApp.
          {' '}
          <a 
            href={privacyPolicyUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="marketing-consent-link"
          >
            Ver Política de Privacidad
          </a>
        </span>
      </label>

      {showInfo && (
        <div className="marketing-consent-info">
          <Info size={14} className="marketing-consent-info-icon" />
          <p>
            <strong>Opcional:</strong> Seguirás recibiendo confirmaciones y recordatorios de tus citas sin importar esta selección.
            Puedes darte de baja en cualquier momento.
          </p>
        </div>
      )}

      <style jsx>{`
        .marketing-consent-wrapper {
          margin: 1.5rem 0;
        }

        .marketing-consent-label {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          cursor: pointer;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 0.75rem;
          transition: all 0.2s;
        }

        .marketing-consent-label:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(10, 132, 255, 0.3);
        }

        .marketing-consent-checkbox {
          width: 1.25rem;
          height: 1.25rem;
          margin-top: 0.125rem;
          cursor: pointer;
          flex-shrink: 0;
          accent-color: var(--app-primary);
        }

        .marketing-consent-text {
          font-size: 0.875rem;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.9);
        }

        .marketing-consent-text strong {
          color: #fff;
          font-weight: 500;
        }

        .marketing-consent-link {
          color: var(--app-primary);
          text-decoration: none;
          border-bottom: 1px solid transparent;
          transition: border-color 0.2s;
        }

        .marketing-consent-link:hover {
          border-bottom-color: var(--app-primary);
        }

        .marketing-consent-info {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          margin-top: 0.75rem;
          padding: 0.75rem 1rem;
          background: rgba(10, 132, 255, 0.1);
          border: 1px solid rgba(10, 132, 255, 0.2);
          border-radius: 0.5rem;
        }

        .marketing-consent-info-icon {
          color: var(--app-primary);
          flex-shrink: 0;
          margin-top: 0.125rem;
        }

        .marketing-consent-info p {
          font-size: 0.75rem;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.7);
          margin: 0;
        }

        .marketing-consent-info strong {
          color: #fff;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}