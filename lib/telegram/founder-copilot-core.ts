import type { FounderIntelligenceResult } from '@/lib/founder/intelligence-core';
import type { TelegramOwnerCommand } from './contracts';

const STRATEGIC_FOUNDER_INTENT = /(?:\bfounder\b|بنیان(?:‌| )?گذار|مهم(?:‌| )?ترین\s+(?:کار|اولویت)|اولویت\s+(?:امروز|شرکت|پروژه)|سرمایه(?:‌| )?گذار|جذب\s+سرمایه|ارزش(?:‌| )?گذاری|valuation|fundrais|investor|cap\s*table|dilution|roadmap|استراتژی|strategy|unit\s*economics|runway|burn\s*rate|آمادگی\s+سرمایه|ریسک\s+(?:کسب|شرکت|پروژه)|تصمیم\s+(?:مدیریتی|بیزنسی|تجاری)|بازار|market|رقیب|رقبا|competitor|benchmark|قیمت\s+بازار|market\s+pricing)/i;
const EXPLICIT_HELP = /^\/(?:help|start)(?:@[A-Za-z0-9_]+)?(?:\s|$)/i;

function clip(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

export function shouldRouteToFounderIntelligence(
  rawText: string,
  command: TelegramOwnerCommand,
) {
  if (command.type === 'FOUNDER_ASK') return true;
  if (command.type !== 'HELP' || EXPLICIT_HELP.test(rawText.trim())) return false;
  return STRATEGIC_FOUNDER_INTENT.test(rawText);
}

export function founderQuestionFromTelegram(
  rawText: string,
  command: TelegramOwnerCommand,
) {
  if (command.type === 'FOUNDER_ASK') return clip(command.question, 4_000);
  return clip(rawText, 4_000);
}

export function formatTelegramFounderResult(result: FounderIntelligenceResult) {
  const lines: string[] = [
    `🧭 Founder Copilot · ${result.confidence}`,
    '',
    clip(result.answer, 1_900),
  ];

  if (result.facts.length) {
    lines.push('', 'واقعیت‌های تأییدشده:');
    for (const fact of result.facts.slice(0, 5)) {
      lines.push(`• ${clip(fact.text, 320)} [${clip(fact.authority, 80)}]`);
    }
  }

  if (result.externalFacts.length) {
    lines.push('', 'شواهد زنده بازار:');
    for (const fact of result.externalFacts.slice(0, 4)) {
      lines.push(`• ${clip(fact.text, 260)}\n  ${clip(fact.sourceUrl, 420)}`);
    }
  }

  if (result.gaps.length) {
    lines.push('', 'شواهد ناقص:');
    for (const gap of result.gaps.slice(0, 4)) lines.push(`• ${clip(gap, 280)}`);
  }

  lines.push('', `اقدام بعدی: ${clip(result.nextAction, 500)}`);
  lines.push(`KPI: ${clip(result.kpi, 360)}`);

  if (result.risks.length) {
    lines.push('', 'ریسک‌ها:');
    for (const risk of result.risks.slice(0, 4)) lines.push(`• ${clip(risk, 280)}`);
  }

  if (result.evidenceAuthorities.length || result.externalSources.length) {
    const parts = [];
    if (result.evidenceAuthorities.length) parts.push(result.evidenceAuthorities.slice(0, 8).join(', '));
    if (result.externalSources.length) parts.push(`${result.externalSources.length} web source(s)`);
    lines.push('', `Evidence: ${parts.join(' · ')}`);
  }

  lines.push('', 'READ ONLY · هیچ تغییری اجرا نشد.');
  return lines.join('\n').slice(0, 3_800);
}
