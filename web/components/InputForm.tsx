'use client';

import { useState } from 'react';
import { Play, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PipelineRunRequest } from '@/types/pipeline';

interface InputFormProps {
  onRun: (request: PipelineRunRequest) => void;
  isRunning: boolean;
}

const DEFAULT_VALUES: PipelineRunRequest = {
  topic: 'Why your paycheck is smaller than your salary',
  niche: 'Personal finance explainers',
  audience: 'Young professionals new to full-time work',
};

/** Left column: the run form. Fully controlled with useState only — no form library, no global state. */
export function InputForm({ onRun, isRunning }: InputFormProps) {
  const [values, setValues] = useState<PipelineRunRequest>(DEFAULT_VALUES);

  function handleChange(field: keyof PipelineRunRequest) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isRunning) return;
    onRun(values);
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>Run pipeline</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <form onSubmit={handleSubmit} className="flex h-full flex-col gap-4">
          <Field label="Topic" name="topic" value={values.topic} onChange={handleChange('topic')} />
          <Field label="Niche" name="niche" value={values.niche} onChange={handleChange('niche')} />
          <Field
            label="Audience"
            name="audience"
            value={values.audience}
            onChange={handleChange('audience')}
          />

          <Button type="submit" disabled={isRunning} className="mt-auto gap-2">
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isRunning ? 'Running…' : 'Run Pipeline'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <label htmlFor={name} className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <textarea
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        rows={2}
        required
        className="resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
  );
}
