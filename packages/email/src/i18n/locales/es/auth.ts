export const auth = {
  verifyEmail: {
    title: 'Verifica tu email',
    preview: 'Verifica tu dirección de email para comenzar',
    greeting: 'Hola {{name}},',
    instruction:
      '¡Gracias por registrarte en Knowtis! Por favor verifica tu dirección de email haciendo clic en el botón de abajo.',
    buttonText: 'Verificar email',
    disclaimer: 'Si no creaste una cuenta, puedes ignorar este mensaje.',
    expiry: 'Este enlace expira en 24 horas.',
  },
  resetPassword: {
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
