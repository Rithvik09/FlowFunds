# Contributing to FlowFunds

We love your input! We want to make contributing to FlowFunds as easy and transparent as possible.

## Development Process

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests if applicable
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Local Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Git

### Setup Steps
1. Clone your fork:
   ```bash
   git clone https://github.com/yourusername/FlowFunds.git
   cd FlowFunds
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

## Code Style Guidelines

### TypeScript/JavaScript
- Use TypeScript for type safety
- Follow ESLint configuration
- Use meaningful variable and function names
- Add JSDoc comments for complex functions

### CSS
- Use Tailwind CSS classes when possible
- Keep custom CSS minimal and well-documented
- Follow mobile-first responsive design

### API Development
- Use RESTful conventions
- Return consistent JSON responses
- Include proper error handling
- Add request validation

## Testing
- Write unit tests for utility functions
- Add integration tests for API endpoints
- Test responsive design on multiple devices
- Verify cross-browser compatibility

## Pull Request Guidelines

### Before Submitting
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] Build passes without errors

### PR Description Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tested locally
- [ ] Added/updated tests
- [ ] Verified responsive design

## Screenshots (if applicable)
Add screenshots for UI changes
```

## Reporting Issues

### Bug Reports
Include:
- Browser and version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Console errors

### Feature Requests
Include:
- Clear description of the feature
- Use case and benefits
- Mockups or examples if applicable

## Code of Conduct

### Our Standards
- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Maintain professionalism

### Enforcement
Violations may result in temporary or permanent bans from the project.

## License
By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?
Feel free to open an issue for questions about contributing!