import {generate} from 'grommet/themes/base';
import {deepMerge} from 'grommet/utils/object';
import {css} from 'styled-components';

const FONT_FAM = '"Spectral", Merriweather, Georgia, serif';
export const theme = deepMerge(generate(24, 10), {
  global: {
    colors: {
      brand: '#1997c6',
      'accent-1': '#3cc7b7',
      focus: 'rgba(60, 199, 183, 0.75)',
    },
    font: {
      family: FONT_FAM,
    },
  },
  heading: {
    font: {
      family: FONT_FAM,
    },
  },
  paragraph: {
    medium: {
      size: '1.1em',
      height: '1.6',
    },
  },
  anchor: {
    fontWeight: 'normal',
    textDecoration: 'underline',
    color: null,
  },
  button: {
    border: {
      radius: 4,
    },
    extend(props) {
      return props.plain
        ? null
        : css`
            &:hover {
              box-shadow: none;
              color: ${props.theme.global.colors.brand};
            }
          `;
    },
  },
  table: {
    header: {
      align: 'start',
      pad: {horizontal: 'small', vertical: 'xsmall'},
      border: 'small',
      style: {fontWeight: 'bold'},
    },
    body: {
      border: 'small',
      align: 'start',
      pad: {horizontal: 'small', vertical: 'xsmall'},
    },
    footer: {
      align: 'start',
      pad: {horizontal: 'small', vertical: 'xsmall'},
      border: 'small',
    },
  },
});

export default theme;
