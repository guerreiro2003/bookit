# Notificações por email — o que falta configurar

O código está pronto (`index.js`): confirmação ao criar, confirmação pela equipa, cancelamento, reagendamento e lembrete 24h antes. **Não está deployado** porque exige serviços fora do plano gratuito.

## Passos (uma vez por projeto)
1. **Plano Blaze** no projeto Firebase (as Functions v2 e o Scheduler exigem-no; custo típico para um salão: cêntimos/mês).
2. Instalar a extensão **Trigger Email from Firestore** (`firebase ext:install firebase/firestore-send-email`):
   - Coleção: `mail`
   - SMTP: URI do fornecedor (ex.: Brevo, Postmark, SendGrid, ou o SMTP do próprio domínio). *Externo: criar conta no fornecedor e verificar o domínio de envio (SPF/DKIM) para não cair em spam.*
   - "Default FROM": `Nome do produto <no-reply@dominio>`
3. Regras Firestore: acrescentar `match /mail/{id} { allow read, write: if false; }` (só as Functions escrevem — o Admin SDK ignora as regras).
4. Índice: as Functions usam `bookings` com `date == X` e `status in […]` — já coberto por índice simples + `in`; se a consola pedir índice, criar via o link do erro.
5. Deploy:
   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```
6. Definir `APP_URL` (env da função) se o domínio de produção for diferente de `bookit-51575.web.app`.

## Comportamento
- `onBookingCreated` → email "Marcação recebida" (ou "confirmada" se criada já confirmada pela equipa).
- `onBookingUpdated` → "confirmada" / "cancelada" / "reagendada" conforme a transição.
- `reminders` (hora a hora) → "Lembrete: marcação amanhã" uma vez por marcação (`reminderSentAt`).
- Nunca envia para marcações anonimizadas nem sem email.

## SMS / WhatsApp
Não implementado. O mesmo padrão (função → fornecedor) aplica-se com Twilio/Vonage; é uma decisão de produto por causa do custo por mensagem.
