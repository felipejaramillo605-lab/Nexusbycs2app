import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { publicAPI } from '../api';
import { useOrganization } from '../context/OrganizationContext';
import { formatCOP } from '../lib/currency';
import { experiencesLabel, formatCycle, landingMenu } from '../lib/portalLanding';
import { whatsappHref } from '../lib/whatsapp';

import { usePortalT } from '../lib/portalI18n';
import PortalLanguageSwitch from '../components/PortalLanguageSwitch';
const bookingPath = (orgId, serviceId) => `/book/${orgId}?reservar=1${serviceId ? `&servicio=${encodeURIComponent(serviceId)}` : ''}`;

/** Pagina de inicio del portal para plantillas de clases grupales: portada, experiencias, planes y contacto. */
export default function PortalLanding() {
  const { t } = usePortalT();
  const { orgId } = useParams();
  const { organization } = useOrganization();
  const [services, setServices] = useState([]);
  const [plans, setPlans] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  const [motion, setMotion] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    let alive = true;
    publicAPI.getServices(orgId).then((response) => { if (alive) setServices(response.data || []); }).catch(() => {});
    publicAPI.getMembershipPlans(orgId).then((response) => { if (alive) setPlans(response.data || []); }).catch(() => {});
    return () => { alive = false; };
  }, [orgId]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Las secciones aparecen suavemente al entrar en pantalla; sin observador o con movimiento reducido quedan visibles.
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined' || !rootRef.current) return undefined;
    setMotion(true);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    rootRef.current.querySelectorAll('.nexus-reveal').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [services.length, plans.length]);

  const groupClasses = useMemo(() => services.filter((item) => item.service_type === 'group' && item.active !== false), [services]);
  const experiences = groupClasses.length ? groupClasses : services.filter((item) => item.active !== false).slice(0, 6);
  const label = experiencesLabel(organization);
  const showPlans = organization?.portal_show_plans !== false && plans.length > 0;
  const menu = landingMenu({ hasExperiences: experiences.length > 0, hasPlans: showPlans, label });
  const chat = organization?.portal_whatsapp_button || organization?.whatsapp_link
    ? whatsappHref(organization?.whatsapp_link || organization?.phone, t('Hola {0}, quisiera información.', organization?.name || ''))
    : null;
  const mediaType = organization?.portal_background_type;
  const mediaUrl = organization?.portal_background_url;
  const hasMedia = !!mediaUrl && (mediaType === 'image' || mediaType === 'video');
  const showMoney = organization?.portal_show_prices !== false;
  const mapUrl = organization?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([organization.address, organization.city].filter(Boolean).join(', '))}`
    : null;
  const name = organization?.name || t('Reserva tu clase');

  return (
    <div className="nexus-landing" ref={rootRef} data-motion={motion ? 'on' : 'off'} data-hero={hasMedia ? 'media' : 'art'} data-testid="portal-landing">
      <header className={`nexus-landing-nav${scrolled ? ' is-scrolled' : ''}`}>
        <a className="nexus-landing-brand" href="#inicio" aria-label={`${name}, inicio`}>
          {organization?.logo_url ? <img src={organization.logo_url} alt={name} /> : <span>{name}</span>}
        </a>
        <nav aria-label={t('Secciones')}>
          {menu.map((item) => <a key={item.id} href={`#${item.id}`}>{t(item.label)}</a>)}
        </nav>
        <div className="nexus-landing-nav-actions">
          <PortalLanguageSwitch />
          <Link className="nexus-landing-login" to={`/portal/${orgId}/auth`}>{t('Iniciar sesión')}</Link>
          <Link className="nexus-landing-reserve" to={bookingPath(orgId)}>{t('Reservar')}</Link>
        </div>
      </header>

      <section id="inicio" className="nexus-landing-hero">
        <div className="nexus-landing-hero-media" aria-hidden="true">
          {hasMedia && mediaType === 'image' && <img src={mediaUrl} alt="" />}
          {hasMedia && mediaType === 'video' && <video src={mediaUrl} autoPlay muted loop playsInline preload="metadata" />}
          {!hasMedia && <div className="nexus-landing-hero-art" />}
        </div>
        <div className="nexus-landing-hero-copy">
          <h1>{name}</h1>
          {organization?.portal_welcome_message && <p>{organization.portal_welcome_message}</p>}
          <div className="nexus-landing-cta">
            <Link className="nexus-landing-reserve is-large" to={bookingPath(orgId)}>{t('Reservar clase')}</Link>
            <Link className="nexus-landing-login is-large" to={`/portal/${orgId}/auth`}>{t('Iniciar sesión')}</Link>
          </div>
        </div>
      </section>

      {experiences.length > 0 && (
        <section id="experiencias" className="nexus-landing-section">
          <header className="nexus-landing-heading nexus-reveal">
            <span className="nexus-landing-kicker">{t(label)}</span>
            <span className="nexus-landing-ornament" aria-hidden="true" />
            <p>{t('Descubre las distintas disciplinas que ofrecemos para ti.')}</p>
          </header>
          <div className="nexus-landing-experiences">
            {experiences.map((item, index) => (
              <Link
                key={item.service_id}
                className="nexus-landing-exp nexus-reveal"
                style={{ '--reveal-delay': `${Math.min(index, 5) * 70}ms` }}
                to={bookingPath(orgId, item.service_id)}
                data-testid="landing-experience"
              >
                <span className="nexus-landing-exp-media">
                  {item.cover_image_url
                    ? <img src={item.cover_image_url} alt={item.image_alt || item.name} loading="lazy" style={{ objectPosition: item.image_focal_point === 'top' ? 'center top' : item.image_focal_point === 'bottom' ? 'center bottom' : 'center' }} />
                    : <span className="nexus-landing-exp-initial" aria-hidden="true">{(item.name || '?').charAt(0)}</span>}
                </span>
                <span className="nexus-landing-exp-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <h3>{item.name}</h3>
                {item.short_description && <p>{item.short_description}</p>}
                <span className="nexus-landing-link">{t('Ver clases')} <span aria-hidden="true">→</span></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {showPlans && (
        <section id="planes" className="nexus-landing-section">
          <header className="nexus-landing-heading nexus-reveal">
            <span className="nexus-landing-kicker">{t('Planes')}</span>
            <span className="nexus-landing-ornament" aria-hidden="true" />
            <p>{t('Elige el plan que mejor se adapte a tus objetivos.')}</p>
          </header>
          <div className="nexus-landing-plans">
            {plans.map((plan, index) => {
              const perClass = plan.classes_per_cycle ? Math.round(plan.price / plan.classes_per_cycle) : null;
              const classesText = plan.unlimited ? t('Clases ilimitadas') : plan.classes_per_cycle ? t(plan.classes_per_cycle === 1 ? '{0} clase' : '{0} clases', plan.classes_per_cycle) : null;
              const details = [
                classesText ? classesText.toLowerCase() : null,
                showMoney ? formatCOP(plan.price) : null,
                t('vigencia {0}', formatCycle(plan.billing_cycle_days, t)),
              ].filter(Boolean).join(' · ');
              const message = t('Hola {0}, quiero el plan {1} ({2}). ¿Cómo puedo pagarlo?', name, plan.name, details);
              const planLink = whatsappHref(organization?.whatsapp_link || organization?.phone, message);
              return (
                <article key={plan.plan_id} className="nexus-landing-plan nexus-reveal" style={{ '--reveal-delay': `${Math.min(index, 5) * 70}ms` }} data-testid="landing-plan">
                  <h3>{plan.name}</h3>
                  <p className="nexus-landing-plan-classes">{classesText}</p>
                  {showMoney && <p className="nexus-landing-plan-price">{formatCOP(plan.price)}</p>}
                  {showMoney && perClass && plan.classes_per_cycle > 1 && <p className="nexus-landing-plan-each">{formatCOP(perClass)} {t('por clase')}</p>}
                  <p className="nexus-landing-plan-cycle">{t('Vigencia:')} {formatCycle(plan.billing_cycle_days, t)}</p>
                  <ul>{plan.services.map((item) => <li key={item.service_id}>{item.name}</li>)}</ul>
                  {planLink
                    ? <a className="nexus-landing-reserve" href={planLink} target="_blank" rel="noopener noreferrer">{t('Quiero este plan')}</a>
                    : <Link className="nexus-landing-reserve" to={`/portal/${orgId}/auth`}>{t('Quiero este plan')}</Link>}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section id="contacto" className="nexus-landing-section nexus-landing-contact">
        <header className="nexus-landing-heading nexus-reveal">
          <span className="nexus-landing-kicker">{t('Contacto')}</span>
          <span className="nexus-landing-ornament" aria-hidden="true" />
        </header>
        <div className="nexus-landing-contact-card nexus-reveal">
          <ul>
            {organization?.address && <li><MapPin size={18} aria-hidden="true" /><span>{[organization.address, organization.city].filter(Boolean).join(', ')}</span></li>}
            {organization?.phone && <li><Phone size={18} aria-hidden="true" /><a href={`tel:${organization.phone}`}>{organization.phone}</a></li>}
            {organization?.email && <li><Mail size={18} aria-hidden="true" /><a href={`mailto:${organization.email}`}>{organization.email}</a></li>}
            {organization?.portal_show_hours !== false && organization?.business_hours && <li><Clock size={18} aria-hidden="true" /><span>{organization.business_hours}</span></li>}
          </ul>
          <div className="nexus-landing-contact-actions">
            {mapUrl && <a className="nexus-landing-login" href={mapUrl} target="_blank" rel="noopener noreferrer">{t('Cómo llegar')}</a>}
            {chat && <a className="nexus-landing-reserve" href={chat} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" /> {t('Escribir por WhatsApp')}</a>}
          </div>
        </div>
      </section>

      <footer className="nexus-landing-footer">© {new Date().getFullYear()} {name}</footer>
    </div>
  );
}
