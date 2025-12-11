'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AlertCondition, AlertRule, AlertRuleOperator } from '@/types';

interface AlertBuilderProps {
  name?: string;
  defaultValue?: AlertRule;
  onRuleChange?: (rule: AlertRule) => void;
  disabled?: boolean;
}

interface ConditionDraft extends AlertCondition {
  id: string;
}

const generateId = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
};

const defaultCondition = (): ConditionDraft => ({
  id: generateId(),
  metric: 'volume',
  operator: 'gt',
  value: 0,
});

const metrics = [
  { label: 'Volume', value: 'volume' },
  { label: 'Probabilité', value: 'probability' },
  { label: 'Prix', value: 'price' },
] as const;

const operators = [
  { label: '>', value: 'gt' },
  { label: '<', value: 'lt' },
] as const;

export function AlertBuilder({ defaultValue, onRuleChange, disabled, name = 'custom_settings' }: AlertBuilderProps) {
  const [ruleOperator, setRuleOperator] = useState<AlertRuleOperator>(defaultValue?.operator ?? 'AND');
  const [conditions, setConditions] = useState<ConditionDraft[]>(
    defaultValue?.conditions.map((condition) => ({ ...condition, id: generateId() })) ?? [defaultCondition()],
  );

  const currentRule = useMemo<AlertRule>(
    () => ({
      operator: ruleOperator,
      conditions: conditions.map(({ id, ...rest }) => ({ ...rest, value: Number(rest.value) })),
    }),
    [conditions, ruleOperator],
  );

  useEffect(() => {
    onRuleChange?.(currentRule);
  }, [currentRule, onRuleChange]);

  const handleConditionChange = useCallback((id: string, patch: Partial<AlertCondition>) => {
    setConditions((prev) => prev.map((condition) => (condition.id === id ? { ...condition, ...patch } : condition)));
  }, []);

  const handleAddCondition = useCallback(() => {
    setConditions((prev) => [...prev, defaultCondition()]);
  }, []);

  const handleRemoveCondition = useCallback((id: string) => {
    setConditions((prev) => (prev.length === 1 ? prev : prev.filter((condition) => condition.id !== id)));
  }, []);

  return (
    <div className="space-y-4">
      <input type="hidden" name={name} value={JSON.stringify(currentRule)} readOnly />

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Combinateur</label>
        <select
          className="w-full rounded-md border border-gray-300 p-2 text-sm"
          value={ruleOperator}
          onChange={(event) => setRuleOperator(event.target.value as AlertRuleOperator)}
          disabled={disabled}
        >
          <option value="AND">Toutes les conditions</option>
          <option value="OR">Au moins une condition</option>
        </select>
      </div>

      <div className="space-y-3">
        {conditions.map((condition) => (
          <div key={condition.id} className="grid grid-cols-12 gap-3 rounded-lg border border-gray-200 p-3">
            <div className="col-span-4">
              <label className="mb-1 block text-xs font-semibold text-gray-600">Métrique</label>
              <select
                className="w-full rounded-md border border-gray-300 p-2 text-sm"
                value={condition.metric}
                onChange={(event) => handleConditionChange(condition.id, { metric: event.target.value as AlertCondition['metric'] })}
                disabled={disabled}
              >
                {metrics.map((metric) => (
                  <option key={metric.value} value={metric.value}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-gray-600">Opérateur</label>
              <select
                className="w-full rounded-md border border-gray-300 p-2 text-sm"
                value={condition.operator}
                onChange={(event) => handleConditionChange(condition.id, { operator: event.target.value as AlertCondition['operator'] })}
                disabled={disabled}
              >
                {operators.map((operator) => (
                  <option key={operator.value} value={operator.value}>
                    {operator.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-4">
              <label className="mb-1 block text-xs font-semibold text-gray-600">Valeur</label>
              <input
                type="number"
                className="w-full rounded-md border border-gray-300 p-2 text-sm"
                value={condition.value}
                onChange={(event) => handleConditionChange(condition.id, { value: Number(event.target.value) })}
                disabled={disabled}
                min={0}
              />
            </div>

            <div className="col-span-2 flex items-end justify-end">
              <button
                type="button"
                className="text-sm text-red-500"
                onClick={() => handleRemoveCondition(condition.id)}
                disabled={disabled || conditions.length === 1}
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="text-sm font-medium text-indigo-600" onClick={handleAddCondition} disabled={disabled}>
        + Ajouter une condition
      </button>
    </div>
  );
}
