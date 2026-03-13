import { z } from "zod"

export const schema = z.object({
  id: z.number(),
  address: z.string(),
  balance: z.string(),
  ethValueUsd: z.number().optional(),
  tokenValueUsd: z.number().optional(),
  tokenHoldings: z.number().optional(),
  txCount: z.number(),
  normalTxCount: z.number().optional(),
  internalTxCount: z.number().optional(),
  tokenTxCount: z.number().optional(),
  fundedBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  dataSource: z.string().optional(),
  clientType: z.string().optional(),
  clientTier: z.string().optional(),
  review: z.string().optional(),
  freqCycle: z.string().optional(),
  freqTier: z.string().optional(),
  addressPurity: z.string().optional(),
})
