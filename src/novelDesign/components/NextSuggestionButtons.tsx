import { Button, Flex, Typography } from 'antd';

const { Text } = Typography;

export interface NextSuggestionButtonsProps {
  suggestions: string[];
  onSuggestionClick: (label: string) => void;
}

export function NextSuggestionButtons({ suggestions, onSuggestionClick }: NextSuggestionButtonsProps) {
  if (suggestions.length === 0) return null;

  return (
    <Flex gap={6} wrap align="center" style={{ marginTop: 4 }}>
      <Text style={{ fontSize: 14, whiteSpace: 'nowrap' }}>✨</Text>
      {suggestions.map((label) => (
        <Button
          key={label}
          size="small"
          type="default"
          style={{ fontSize: 12, borderRadius: 14 }}
          onClick={() => onSuggestionClick(label)}
        >
          {label}
        </Button>
      ))}
    </Flex>
  );
}
