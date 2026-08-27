export const auth = {
  verifyEmail: {
    subject: 'Verifica tu email — Knowtis',
    title: 'Verifica tu email',
    preview: 'Tu código de verificación es {{code}}',
    greeting: 'Hola {{name}},',
    instruction:
      '¡Gracias por registrarte en Knowtis! Ingresa este código para verificar tu dirección de email.',
    codeIntro: 'Código de verificación',
    codeExpiry: 'Este código expira en 15 minutos.',
    buttonText: 'Verificar email',
    disclaimer: 'Si no creaste una cuenta, puedes ignorar este mensaje.',
    expiry: 'Este enlace expira en 24 horas.',
  },
  resetPassword: {
    subject: 'Restablece tu contraseña — Knowtis',
    title: 'Restablecer contraseña',
    preview: 'Restablece tu contraseña de Knowtis',
    greeting: 'Hola {{name}},',
    instruction:
      'Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón de abajo para elegir una nueva.',
    buttonText: 'Restablecer contraseña',
    disclaimer: 'Si no solicitaste esto, puedes ignorar este mensaje.',
    expiry: 'Este enlace expira en 1 hora.',
  },
} as const;
