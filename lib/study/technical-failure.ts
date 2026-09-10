export const TECHNICAL_FAILURE_CODES = [
  "MICROPHONE_PERMISSION_DENIED",
  "MICROPHONE_UNAVAILABLE",
  "SPEECH_NOT_CONFIGURED",
  "SPEECH_AUTH_FAILED",
  "SPEECH_SERVICE_UNAVAILABLE",
  "AUDIO_UPLOAD_FAILED",
  "SEMANTIC_NOT_CONFIGURED",
  "SEMANTIC_AUTH_FAILED",
  "SEMANTIC_DEPLOYMENT_NOT_FOUND",
  "SEMANTIC_RATE_LIMITED",
  "SEMANTIC_TIMEOUT",
  "SEMANTIC_INVALID_RESPONSE",
  "SEMANTIC_SERVICE_UNAVAILABLE",
  "EMOTION_NOT_CONFIGURED",
  "EMOTION_AUTH_FAILED",
  "EMOTION_RATE_LIMITED",
  "EMOTION_TIMEOUT",
  "EMOTION_INVALID_RESPONSE",
  "EMOTION_SERVICE_UNAVAILABLE",
  "NETWORK_ERROR",
  "ANALYSIS_FAILED",
] as const;

export type TechnicalFailureCode = (typeof TECHNICAL_FAILURE_CODES)[number];

export type TechnicalFailureStage =
  | "microphone"
  | "speech"
  | "upload"
  | "semantic"
  | "emotion"
  | "network"
  | "analysis";

export interface TechnicalFailure {
  code: TechnicalFailureCode;
  stage: TechnicalFailureStage;
  label: string;
  userMessage: string;
  retryable: boolean;
}

const FAILURE_CATALOG: Record<TechnicalFailureCode, TechnicalFailure> = {
  MICROPHONE_PERMISSION_DENIED: {
    code: "MICROPHONE_PERMISSION_DENIED",
    stage: "microphone",
    label: "麥克風權限未開啟",
    userMessage: "瀏覽器沒有麥克風權限。請在網站設定允許麥克風後再錄一次。",
    retryable: false,
  },
  MICROPHONE_UNAVAILABLE: {
    code: "MICROPHONE_UNAVAILABLE",
    stage: "microphone",
    label: "找不到麥克風",
    userMessage: "目前找不到可用的麥克風。請檢查裝置或關閉其他正在使用麥克風的 App。",
    retryable: false,
  },
  SPEECH_NOT_CONFIGURED: {
    code: "SPEECH_NOT_CONFIGURED",
    stage: "speech",
    label: "語音辨識尚未設定",
    userMessage: "Azure Speech 尚未設定。請通知研究人員檢查 Speech Key 與 Region。",
    retryable: false,
  },
  SPEECH_AUTH_FAILED: {
    code: "SPEECH_AUTH_FAILED",
    stage: "speech",
    label: "語音辨識憑證錯誤",
    userMessage: "Azure Speech 憑證驗證失敗。請通知研究人員檢查 Speech Key 與 Region 是否屬於同一資源。",
    retryable: false,
  },
  SPEECH_SERVICE_UNAVAILABLE: {
    code: "SPEECH_SERVICE_UNAVAILABLE",
    stage: "speech",
    label: "語音辨識服務暫時無法使用",
    userMessage: "語音辨識服務暫時無法使用，請稍後再開始錄音。",
    retryable: true,
  },
  AUDIO_UPLOAD_FAILED: {
    code: "AUDIO_UPLOAD_FAILED",
    stage: "upload",
    label: "錄音上傳失敗",
    userMessage: "錄音上傳失敗，但檔案仍安全保存在這台裝置；連線恢復後會自動重試。",
    retryable: true,
  },
  SEMANTIC_NOT_CONFIGURED: {
    code: "SEMANTIC_NOT_CONFIGURED",
    stage: "semantic",
    label: "語意分析尚未設定",
    userMessage: "Azure OpenAI 尚未完整設定。錄音已保留，請通知研究人員檢查 Endpoint、Key 與 Deployment。",
    retryable: true,
  },
  SEMANTIC_AUTH_FAILED: {
    code: "SEMANTIC_AUTH_FAILED",
    stage: "semantic",
    label: "語意分析憑證錯誤",
    userMessage: "Azure OpenAI 憑證驗證失敗。錄音已保留，修正 Key 後系統會自動重試。",
    retryable: true,
  },
  SEMANTIC_DEPLOYMENT_NOT_FOUND: {
    code: "SEMANTIC_DEPLOYMENT_NOT_FOUND",
    stage: "semantic",
    label: "找不到模型部署",
    userMessage: "Azure OpenAI 找不到指定的模型部署。錄音已保留，請檢查 Endpoint 與 Deployment 名稱。",
    retryable: true,
  },
  SEMANTIC_RATE_LIMITED: {
    code: "SEMANTIC_RATE_LIMITED",
    stage: "semantic",
    label: "語意分析流量超限",
    userMessage: "語意分析服務目前忙碌。錄音已保留，系統會自動重試。",
    retryable: true,
  },
  SEMANTIC_TIMEOUT: {
    code: "SEMANTIC_TIMEOUT",
    stage: "semantic",
    label: "語意分析逾時",
    userMessage: "語意分析等候逾時。錄音已保留，系統會自動重試。",
    retryable: true,
  },
  SEMANTIC_INVALID_RESPONSE: {
    code: "SEMANTIC_INVALID_RESPONSE",
    stage: "semantic",
    label: "語意分析回應格式錯誤",
    userMessage: "語意分析服務回傳了無法讀取的結果。錄音已保留，系統會自動重試。",
    retryable: true,
  },
  SEMANTIC_SERVICE_UNAVAILABLE: {
    code: "SEMANTIC_SERVICE_UNAVAILABLE",
    stage: "semantic",
    label: "語意分析服務異常",
    userMessage: "語意分析服務暫時無法使用。錄音已保留，系統會自動重試。",
    retryable: true,
  },
  EMOTION_NOT_CONFIGURED: {
    code: "EMOTION_NOT_CONFIGURED",
    stage: "emotion",
    label: "情緒分析尚未設定",
    userMessage: "emotion2vec 尚未設定。錄音已保留，請通知研究人員檢查服務網址與權限。",
    retryable: true,
  },
  EMOTION_AUTH_FAILED: {
    code: "EMOTION_AUTH_FAILED",
    stage: "emotion",
    label: "情緒分析權限錯誤",
    userMessage: "emotion2vec 權限驗證失敗。錄音已保留，請檢查 Cloud Run Invoker 權限。",
    retryable: true,
  },
  EMOTION_RATE_LIMITED: {
    code: "EMOTION_RATE_LIMITED",
    stage: "emotion",
    label: "情緒分析流量超限",
    userMessage: "情緒分析服務目前忙碌。錄音已保留，系統會自動重試。",
    retryable: true,
  },
  EMOTION_TIMEOUT: {
    code: "EMOTION_TIMEOUT",
    stage: "emotion",
    label: "情緒分析逾時",
    userMessage: "情緒分析等候逾時。錄音已保留，系統會自動重試。",
    retryable: true,
  },
  EMOTION_INVALID_RESPONSE: {
    code: "EMOTION_INVALID_RESPONSE",
    stage: "emotion",
    label: "情緒分析回應格式錯誤",
    userMessage: "情緒分析服務回傳了無法讀取的結果。錄音已保留，系統會自動重試。",
    retryable: true,
  },
  EMOTION_SERVICE_UNAVAILABLE: {
    code: "EMOTION_SERVICE_UNAVAILABLE",
    stage: "emotion",
    label: "情緒分析服務異常",
    userMessage: "情緒分析服務暫時無法使用。錄音已保留，系統會自動重試。",
    retryable: true,
  },
  NETWORK_ERROR: {
    code: "NETWORK_ERROR",
    stage: "network",
    label: "網路連線中斷",
    userMessage: "目前網路連線中斷。錄音已安全保存在這台裝置，恢復連線後會自動重試。",
    retryable: true,
  },
  ANALYSIS_FAILED: {
    code: "ANALYSIS_FAILED",
    stage: "analysis",
    label: "系統分析錯誤",
    userMessage: "系統分析暫時失敗。錄音已保留，系統會自動重試。",
    retryable: true,
  },
};

export function getTechnicalFailure(code: TechnicalFailureCode): TechnicalFailure {
  return FAILURE_CATALOG[code];
}

export function isTechnicalFailureCode(value: unknown): value is TechnicalFailureCode {
  return typeof value === "string" &&
    (TECHNICAL_FAILURE_CODES as readonly string[]).includes(value);
}

export class TechnicalFailureError extends Error {
  readonly failure: TechnicalFailure;

  constructor(
    code: TechnicalFailureCode,
    readonly technicalDetail?: string,
    options?: ErrorOptions,
  ) {
    const failure = getTechnicalFailure(code);
    super(failure.userMessage, options);
    this.name = "TechnicalFailureError";
    this.failure = failure;
  }
}

export function failureFromError(
  error: unknown,
  fallbackCode: TechnicalFailureCode = "ANALYSIS_FAILED",
): TechnicalFailure {
  if (error instanceof TechnicalFailureError) return error.failure;
  if (
    error && typeof error === "object" && "failure" in error &&
    error.failure && typeof error.failure === "object" &&
    "code" in error.failure && isTechnicalFailureCode(error.failure.code)
  ) {
    return getTechnicalFailure(error.failure.code);
  }
  return getTechnicalFailure(fallbackCode);
}
