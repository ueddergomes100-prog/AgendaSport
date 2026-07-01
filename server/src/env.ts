import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_ANON_KEY: z.string().min(20),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ASAAS_API_KEY: z.string().optional(),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PROVIDER: z.enum(['meta', 'evolution', 'disabled']).default('disabled'),
  WHATSAPP_API_URL: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().default('agendasport_webhook_2026'),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_GRAPH_API_VERSION: z.string().default('v25.0'),
  WHATSAPP_CONFIRMATION_TEMPLATE_NAME: z.string().default('confirmacao_pelada'),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().default('pt_BR'),
  REMINDER_WORKER_ENABLED: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  REMINDER_INTERVAL_MINUTES: z.coerce.number().positive().default(15),
})

export const env = envSchema.parse(process.env)
