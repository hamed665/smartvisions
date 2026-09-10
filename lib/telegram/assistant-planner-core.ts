import { MUTATING_COMMANDS, type TelegramOwnerCommand } from './contracts';
import { parseTelegramOwnerCommand } from './parser';

export type OwnerAssistantImportance = 'NORMAL' | 'IMPORTANT' | 'CRITICAL';

export type OwnerAssistantPlan =
  | { mode: 'COMMAND'; command: TelegramOwnerCommand; canonicalCommand: string; importance: OwnerAssistantImportance; reason: string }
  | { mode: 'ANSWER' | 'CLARIFY' | 'BLOCKED'; text: string; importance: OwnerAssistantImportance; reason: string };

export type RawOwnerAssistantPlan = {
  mode?: unknown;
  canonical_command?: unknown;
  answer?: unknown;
  importance?: unknown;
  reason?: unknown;
};

const explicitHelp = /^(?:\/?help|\/?start|کمک|راهنما)$/i;
const greeting = /^(?:سلام|درود|hello|hi|hey|صبح بخیر|عصر بخیر|شب بخیر)[!.؟\s]*$/i;
const thanks = /^(?:ممنون|مرسی|سپاس|thank you|thanks)[!.؟\s]*$/i;
const explicitMutation = /(?:\d+(?:\.\d+)?\s*(?:کن|بذار|بگذار)|تنظیم|تغییر|ویرایش|فعال|غیرفعال|روشن|خاموش|متوقف|ادامه|شروع|بساز|ایجاد|ارسال|بفرست|تأیید|تایید|رد|برگردان|حذف|set|change|update|enable|disable|pause|resume|start|create|send|approve|reject|revert|delete)/i;
const forbiddenCommand = /^\/(?:alert_?test)(?:@|\s|$)/i;
const allowedCommand = /^\/(?:status|services|markets|agents|budget|approvals|campaigns|policy|pricing|leads|price|discount|minimum|service|option|tone|dialect|locale|replywords|window|agent|threshold|limit|kill|hunt|market|pause|resume|approve|reject|revert|panel|email|outreach)(?:@|\s|$)/i;

const safeText = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

export function isExplicitHelpRequest(input: string) {
  return explicitHelp.test(input.trim());
}

export function freeOwnerAssistantReply(input: string): OwnerAssistantPlan | null {
  const text = input.trim();
  if (greeting.test(text)) {
    return {
      mode: 'ANSWER',
      importance: 'NORMAL',
      reason: 'DETERMINISTIC_GREETING',
      text: 'سلام حامد. آماده‌ام وضعیت واقعی سیستم را بررسی کنم، دلیل مشکلات را توضیح بدهم یا یک تغییر کنترل‌شده را برای تأیید آماده کنم. مثلاً بگو «الان چه چیز مهمی نیاز به توجه دارد؟»',
    };
  }
  if (thanks.test(text)) {
    return { mode: 'ANSWER', importance: 'NORMAL', reason: 'DETERMINISTIC_THANKS', text: 'خواهش می‌کنم. هر زمان خواستی وضعیت، کمپین‌ها، هزینه‌ها یا تنظیمات را بررسی می‌کنم.' };
  }
  return null;
}

export function shouldUseOwnerAssistantPlanner(input: string, parsed: TelegramOwnerCommand) {
  return parsed.type === 'HELP' && !isExplicitHelpRequest(input) && freeOwnerAssistantReply(input) === null;
}

export function hasExplicitMutationIntent(input: string) {
  return explicitMutation.test(input);
}

export function redactOwnerAssistantContext(input: string) {
  return input
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_BOT_TOKEN]')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]{10,}){1,2}\b/g, '[REDACTED_JWT]')
    .replace(/((?:api[_ -]?key|secret|token|password|authorization|رمز|توکن|کلید)\s*[:=]?\s*)\S+/gi, '$1[REDACTED]')
    .slice(0, 4_000);
}

export function parseOwnerAssistantPlan(raw: RawOwnerAssistantPlan, originalInput: string): OwnerAssistantPlan {
  const mode = safeText(raw.mode, 20).toUpperCase();
  const importanceRaw = safeText(raw.importance, 20).toUpperCase();
  const importance: OwnerAssistantImportance = importanceRaw === 'CRITICAL' || importanceRaw === 'IMPORTANT' ? importanceRaw : 'NORMAL';
  const reason = safeText(raw.reason, 300) || 'OWNER_ASSISTANT';

  if (mode === 'COMMAND') {
    const canonicalCommand = safeText(raw.canonical_command, 2_000);
    if (!allowedCommand.test(canonicalCommand) || forbiddenCommand.test(canonicalCommand)) {
      return { mode: 'BLOCKED', importance: 'IMPORTANT', reason: 'UNREGISTERED_COMMAND', text: 'این درخواست به یک فرمان ثبت‌شده و امن تبدیل نشد؛ بنابراین هیچ تغییری انجام نمی‌دهم.' };
    }
    const command = parseTelegramOwnerCommand(canonicalCommand);
    if (command.type === 'HELP' || command.type === 'TEST_OWNER_ALERT') {
      return { mode: 'CLARIFY', importance: 'NORMAL', reason: 'COMMAND_NOT_RESOLVED', text: 'منظور دقیق فرمان مشخص نشد. لطفاً نام بخش و تغییری که می‌خواهی را کمی دقیق‌تر بگو.' };
    }
    if (MUTATING_COMMANDS.has(command.type) && !hasExplicitMutationIntent(originalInput)) {
      return { mode: 'CLARIFY', importance: 'IMPORTANT', reason: 'MUTATION_NOT_EXPLICIT', text: 'این درخواست می‌تواند تنظیمات را تغییر دهد، اما فرمان تغییر صریح نیست. دقیق بگو چه چیزی را به چه مقداری تغییر بدهم.' };
    }
    return { mode: 'COMMAND', command, canonicalCommand, importance, reason };
  }

  if (mode === 'BLOCKED') {
    return { mode: 'BLOCKED', importance: 'IMPORTANT', reason, text: 'این درخواست با مرزهای امنیتی یا عملیاتی سیستم سازگار نیست؛ هیچ تغییری انجام نشد.' };
  }

  const answer = safeText(raw.answer, 1_600);
  if (mode === 'ANSWER' && answer) return { mode: 'ANSWER', text: answer, importance, reason };
  return {
    mode: 'CLARIFY',
    importance,
    reason: reason || 'CLARIFICATION_REQUIRED',
    text: answer || 'برای انجام درست کار، لطفاً درخواست را با نام بخش، بازار یا مقدار موردنظر کمی دقیق‌تر بگو.',
  };
}
