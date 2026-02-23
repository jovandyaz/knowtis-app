import { Column, Row, Section, Text } from '@react-email/components';

import { GradientEnd, GradientStart } from '../design-tokens/colors';

export const Header = () => {
  return (
    <Section>
      <Row>
        <Column
          className="h-[70px] text-center"
          style={{
            background: `linear-gradient(to right, ${GradientStart}, ${GradientEnd})`,
          }}
        >
          <Text className="text-white text-2xl font-bold m-0 tracking-wide">
            Knowtis
          </Text>
        </Column>
      </Row>
    </Section>
  );
};
