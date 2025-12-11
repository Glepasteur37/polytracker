export type AlertMetric = 'volume' | 'probability' | 'price';
export type AlertOperator = 'gt' | 'lt';
export type AlertRuleOperator = 'AND' | 'OR';
export type AlertType = 'PRESET' | 'CUSTOM';
export type AlertPresetType = 'WHALE' | 'FLIP';

export interface UserProfile {
  id: string;
  is_pro: boolean;
  subscription_id: string | null;
}

export interface AlertCondition {
  metric: AlertMetric;
  operator: AlertOperator;
  value: number;
}

export interface AlertRule {
  operator: AlertRuleOperator;
  conditions: AlertCondition[];
}

export interface Alert {
  id: string;
  user_id: string;
  market_slug: string;
  type: AlertType;
  preset_type?: AlertPresetType;
  custom_settings?: AlertRule;
  last_triggered_at: string | null;
}
