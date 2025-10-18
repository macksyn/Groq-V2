/**
 * Format phone number
 */
export function formatPhone(phone) {
  return phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
}

/**
 * Check if user is owner
 */
export function isOwner(jid) {
  const ownerNumber = process.env.OWNER_NUMBER;
  return jid.includes(ownerNumber);
}

/**
 * Extract mentions from message
 */
export function getMentions(text) {
  const mentionRegex = /@(\d+)/g;
  const mentions = [];
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1] + '@s.whatsapp.net');
  }

  return mentions;
}

/**
 * Sleep helper
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send button message
 */
export async function sendButton(sock, jid, options) {
  const {
    text,
    footer = '',
    buttons = [],
    headerType = 1
  } = options;

  const buttonMessage = {
    text,
    footer,
    buttons: buttons.map((btn, i) => ({
      buttonId: btn.id || `btn_${i}`,
      buttonText: { displayText: btn.text },
      type: 1
    })),
    headerType
  };

  return await sock.sendMessage(jid, buttonMessage);
}

/**
 * Send list message
 */
export async function sendList(sock, jid, options) {
  const {
    text,
    footer = '',
    title,
    buttonText,
    sections = []
  } = options;

  const listMessage = {
    text,
    footer,
    title,
    buttonText,
    sections
  };

  return await sock.sendMessage(jid, listMessage);
}