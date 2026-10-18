import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const FORBIDDEN_PACKAGES = [
  'antd',
  'lucide-react',
  'react-feather',
  'react-bootstrap',
  'semantic-ui-react',
  'primereact',
  'flowbite-react',
  'daisyui',
  'rsuite',
  'evergreen-ui',
  'grommet',
  '@carbon/react',
  '@carbon/icons-react',
  '@blueprintjs/core',
  '@blueprintjs/icons',
  '@nextui-org/react',
  '@heroui/react',
  '@phosphor-icons/react',
  '@tabler/icons-react',
  '@iconify/react',
  '@remixicon/react',
  '@primer/octicons-react',
  '@primer/react',
  '@mdi/react',
  '@mdi/js',
  'material-icons',
  'bootstrap-icons',
  'feather-icons',
];

const FORBIDDEN_PATTERN = {
  group: [
    'react-icons',
    'react-icons/*',
    '@heroicons/*',
    '@fortawesome/*',
    '@mui/*',
    '@material-ui/*',
    '@chakra-ui/*',
    '@radix-ui/*',
    '@headlessui/*',
    '@mantine/*',
    '@ant-design/*',
    '@fluentui/*',
    '@base-ui-components/*',
    '@ark-ui/*',
    '@shadcn/*',
  ],
  message: 'Section 4: icons come from Material Symbols and primitives from react-aria-components in src/ui/.',
};

const UI_ONLY_PATTERN = {
  group: [
    'react-aria-components',
    'react-aria',
    'react-aria/*',
    'react-stately',
    '@react-aria/*',
    '@react-stately/*',
    '@nivo/*',
  ],
  message: 'Section 4: import primitives, templates and charts from src/ui instead of using the underlying library directly.',
};

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      'no-alert': 'error',
      'no-restricted-imports': ['error', { paths: FORBIDDEN_PACKAGES, patterns: [FORBIDDEN_PATTERN] }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/ui/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: FORBIDDEN_PACKAGES, patterns: [FORBIDDEN_PATTERN, UI_ONLY_PATTERN] },
      ],
    },
  }
);
