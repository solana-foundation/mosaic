# Contributing to Mosaic

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## 🚀 Getting Started

1. **Fork the repository**
2. **Clone your fork**

   ```bash
   git clone https://github.com/your-username/mosaic.git
   cd mosaic
   ```

3. **Install dependencies**

   ```bash
   pnpm install
   ```

4. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 📦 Project Structure

- `packages/core/` - Core Token-2022 wrapper library
- `packages/sdk/` - Token templates and SDK functionality
- `packages/cli/` - Command-line interface
- `packages/ui/` - Web interface

## 🔧 Development Workflow

### Code Style

- Use TypeScript for all new code
- Follow the existing code style (Prettier + ESLint)
- Write meaningful commit messages

### Testing

- Add tests for new functionality
- Ensure all tests pass: `pnpm test`
- Maintain or improve code coverage

### Before Submitting

```bash
# Format code
pnpm run format

# Lint code
pnpm run lint

# Type check
pnpm run type-check

# Build
pnpm run build

# Test
pnpm run test
```

## 📝 Pull Request Guidelines

1. **Clear Description**: Explain what changes you made and why
2. **Link Issues**: Reference any related issues
3. **Small PRs**: Keep changes focused and atomic
4. **Tests**: Include tests for new functionality
5. **Documentation**: Update README/docs if needed

## 🪙 Token Extension Guidelines

When working with Token-2022 extensions:

- Follow Solana best practices
- Ensure compatibility with SRFC standards
- Add comprehensive error handling
- Document extension interactions
- Test on devnet before mainnet

## 🐛 Bug Reports

Include:

- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Node.js version, OS, etc.)
- Relevant logs or error messages

## 💡 Feature Requests

- Check existing issues first
- Provide clear use case and requirements
- Consider Token-2022 compatibility
- Think about impact on different packages

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## ❓ Questions

- Open an issue for questions
- Check existing documentation
- Review Token-2022 specifications
