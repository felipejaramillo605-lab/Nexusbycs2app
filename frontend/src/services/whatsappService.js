/**
 * WhatsApp Business API Service (Mock Implementation)
 * 
 * This service is structured to integrate with WhatsApp Business API (Meta)
 * Currently in mock mode for development.
 * 
 * To activate real WhatsApp integration:
 * 1. Get WhatsApp Business API credentials from Meta
 * 2. Set WHATSAPP_API_KEY and WHATSAPP_PHONE_ID in environment
 * 3. Replace mock functions with actual API calls
 */

const WHATSAPP_API_KEY = process.env.REACT_APP_WHATSAPP_API_KEY || '';
const WHATSAPP_PHONE_ID = process.env.REACT_APP_WHATSAPP_PHONE_ID || '';
const IS_MOCK_MODE = !WHATSAPP_API_KEY;

// Message Templates
export const MESSAGE_TEMPLATES = {
  APPOINTMENT_CONFIRMATION: 'appointment_confirmation',
  APPOINTMENT_REMINDER: 'appointment_reminder',
  REACTIVATION: 'reactivation',
  PROMOTION: 'promotion',
  OPERATIONAL_NOTICE: 'operational_notice'
};

/**
 * Generate confirmation message with cancellation link
 */
export const generateConfirmationMessage = (appointment, cancelUrl) => {
  return `✅ *Cita Confirmada - Nexus by CS2*

📅 Fecha: ${appointment.date}
🕐 Hora: ${appointment.time}
✂️ Servicio: ${appointment.service_name}
👤 Barbero: ${appointment.barber_name}
💰 Precio: $${appointment.service_price}

Para cancelar tu cita, ingresa a:
${cancelUrl}

¡Te esperamos! 💈`;
};

/**
 * Generate reminder message (24h before)
 */
export const generateReminderMessage = (appointment) => {
  return `🔔 *Recordatorio de Cita - Nexus by CS2*

¡Hola ${appointment.client_name}!

Tu cita es mañana:
📅 ${appointment.date}
🕐 ${appointment.time}
✂️ ${appointment.service_name}
👤 ${appointment.barber_name}

¡No faltes! 💈`;
};

/**
 * Generate reactivation message
 */
export const generateReactivationMessage = (clientName) => {
  return `👋 *¡Te extrañamos! - Nexus by CS2*

Hola ${clientName},

Hace mucho que no te vemos. ¿Qué tal un nuevo look? 💇‍♂️

Agenda tu cita aquí:
[BOOKING_LINK]

¡Te esperamos! ✨`;
};

/**
 * Generate promotion message
 */
export const generatePromotionMessage = (clientName, promotion) => {
  return `🎉 *¡Oferta Especial! - Nexus by CS2*

Hola ${clientName},

${promotion}

¡No te lo pierdas! Agenda ya:
[BOOKING_LINK]

Válido por tiempo limitado ⏰`;
};

/**
 * Generate operational notice
 */
export const generateOperationalNotice = (notice) => {
  return `📢 *Aviso Importante - Nexus by CS2*

${notice}

Gracias por tu comprensión 🙏`;
};

/**
 * Send WhatsApp message (Mock Implementation)
 */
export const sendWhatsAppMessage = async (phoneNumber, message, templateId = null) => {
  if (IS_MOCK_MODE) {
    // Mock implementation - Log to console and show toast
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📱 MOCK WhatsApp Message Sent');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('To:', phoneNumber);
    console.log('Template:', templateId || 'custom');
    console.log('Message:');
    console.log(message);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return {
      success: true,
      mock: true,
      message_id: `mock_${Date.now()}`,
      phone: phoneNumber
    };
  }
  
  // Real WhatsApp Business API implementation (when activated)
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: message
        }
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to send WhatsApp message');
    }
    
    return {
      success: true,
      message_id: data.messages[0].id,
      phone: phoneNumber
    };
  } catch (error) {
    console.error('WhatsApp API Error:', error);
    throw error;
  }
};

/**
 * Send appointment confirmation with cancellation link
 */
export const sendAppointmentConfirmation = async (appointment) => {
  if (!appointment.management_token) {
    throw new Error('Missing appointment management token');
  }
  const cancelUrl = `${window.location.origin}/cancel/${appointment.appointment_id}?token=${encodeURIComponent(appointment.management_token)}`;
  const message = generateConfirmationMessage(appointment, cancelUrl);
  
  return await sendWhatsAppMessage(
    appointment.client_phone,
    message,
    MESSAGE_TEMPLATES.APPOINTMENT_CONFIRMATION
  );
};

/**
 * Send appointment reminder (24h before)
 */
export const sendAppointmentReminder = async (appointment) => {
  const message = generateReminderMessage(appointment);
  
  return await sendWhatsAppMessage(
    appointment.client_phone,
    message,
    MESSAGE_TEMPLATES.APPOINTMENT_REMINDER
  );
};

/**
 * Send reactivation message
 */
export const sendReactivationMessage = async (client, bookingLink) => {
  const message = generateReactivationMessage(client.name).replace('[BOOKING_LINK]', bookingLink);
  
  return await sendWhatsAppMessage(
    client.phone,
    message,
    MESSAGE_TEMPLATES.REACTIVATION
  );
};

/**
 * Send promotion message
 */
export const sendPromotionMessage = async (client, promotion, bookingLink) => {
  const message = generatePromotionMessage(client.name, promotion).replace('[BOOKING_LINK]', bookingLink);
  
  return await sendWhatsAppMessage(
    client.phone,
    message,
    MESSAGE_TEMPLATES.PROMOTION
  );
};

/**
 * Send operational notice
 */
export const sendOperationalNotice = async (phoneNumber, notice) => {
  const message = generateOperationalNotice(notice);
  
  return await sendWhatsAppMessage(
    phoneNumber,
    message,
    MESSAGE_TEMPLATES.OPERATIONAL_NOTICE
  );
};

/**
 * Batch send messages to multiple clients
 */
export const sendBatchMessages = async (clients, message, templateId) => {
  const results = [];
  
  for (const client of clients) {
    try {
      const result = await sendWhatsAppMessage(client.phone, message, templateId);
      results.push({ client, success: true, ...result });
    } catch (error) {
      results.push({ client, success: false, error: error.message });
    }
  }
  
  return results;
};

export default {
  sendWhatsAppMessage,
  sendAppointmentConfirmation,
  sendAppointmentReminder,
  sendReactivationMessage,
  sendPromotionMessage,
  sendOperationalNotice,
  sendBatchMessages,
  MESSAGE_TEMPLATES,
  IS_MOCK_MODE
};
