import { Column, Img, Row, Section } from '@react-email/components';

import { GradientEnd, GradientStart } from '../design-tokens/colors';

export const Header = () => {
  return (
    <Section>
      <Row>
        <Column
          className="h-[70px] text-center"
          style={{
            background: `linear-gradient(to right, ${GradientStart}, ${GradientEnd})`,
            verticalAlign: 'middle',
          }}
        >
          <Img
            src="https://knowtis.vercel.app/email/knowtis-logo-white.png"
            alt="Knowtis"
            width="140"
            height="53"
            style={{ margin: '0 auto' }}
          />
        </Column>
      </Row>
    </Section>
  );
};
