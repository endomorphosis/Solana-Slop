# Solana-Slop Crowdfunding Platform Documentation

Welcome to the comprehensive documentation for the legal crowdfunding campaign platform built on Solana.

## Table of Contents

1. [Overview and Architecture](./01-overview-and-architecture.md)
2. [Core Concepts and Domain Model](./02-core-concepts-domain-model.md)
3. [Financial Controls and DAO Treasury](./03-financial-controls-dao-treasury.md)
4. [Multi-Round Appeal System](./04-multi-round-appeal-system.md)
5. [Court Hierarchy and Litigation Paths](./05-court-hierarchy-litigation-paths.md)
6. [Conditional Fundraising Logic](./06-conditional-fundraising-logic.md)
7. [Multisig Approval Mechanisms](./07-multisig-approval-mechanisms.md)
8. [Invoice Payment System](./08-invoice-payment-system.md)
9. [Testing Strategy and Chaos Testing](./09-testing-strategy-chaos-testing.md)
10. [API Reference Guide](./10-api-reference-guide.md)
11. [Design Decisions and Rationale](./11-design-decisions-rationale.md)
12. [Usage Examples and Workflows](./12-usage-examples-workflows.md)
9. [Testing Strategy and Chaos Testing](./09-testing-strategy-chaos-testing.md)
10. [API Reference Guide](./10-api-reference-guide.md)
11. [Design Decisions and Rationale](./11-design-decisions-rationale.md)
12. [Usage Examples and Workflows](./12-usage-examples-workflows.md)

## Quick Start

This documentation is organized to help you understand:
- **Why** design decisions were made
- **How** the system works internally
- **What** features are available and how to use them

Each document includes:
- Links to relevant source code
- Design rationale and reasoning
- Usage examples
- Edge cases and considerations

## Source Code Structure

```
src/crowdfunding/
  ├── types.ts       # Type definitions and interfaces
  ├── errors.ts      # Error classes
  └── campaign.ts    # Main Campaign class implementation

tests/
  ├── crowdfunding/
  │   ├── campaign.test.ts        # Unit tests
  │   └── scenario-runner.test.ts # Chaos testing
  └── scenarios/                   # 102 JSON test scenarios
```

## Key Features

- **Community Crowdfunding**: Secure fundraising with automatic refunds
- **10% DAO Fee**: Sustainable platform operation through treasury fees
- **3-Signer Multisig**: Attorney, platform, and client governance
- **Multi-Round Appeals**: Intelligent multi-level litigation support
- **Conditional Fundraising**: Smart fund availability checking
- **Differential Approval**: Risk-based approval thresholds (1/3 for wins, 2/3 for losses)
- **Invoice Payment System**: Transparent attorney service payments
- **Court Award Deposits**: Attorney-controlled fee deposits
- **Comprehensive Testing**: 31 unit tests + 102 chaos scenarios

## Getting Started

For developers new to this codebase, we recommend reading in this order:

1. Start with [Overview and Architecture](./01-overview-and-architecture.md) for the big picture
2. Read [Core Concepts](./02-core-concepts-domain-model.md) to understand the domain model
3. Explore [Design Decisions](./11-design-decisions-rationale.md) to understand the "why"
4. Review [Usage Examples](./12-usage-examples-workflows.md) for practical implementation

For specific features, jump directly to the relevant section using the table of contents.

## Contributing

When making changes to the system:
1. Review the relevant documentation sections
2. Understand the design rationale behind existing implementations
3. Update documentation when adding new features
4. Add test scenarios for new functionality

## Support

For questions or issues:
- Review the [API Reference](./10-api-reference-guide.md) for usage details
- Check [Design Decisions](./11-design-decisions-rationale.md) for architectural context
- Examine test scenarios in `tests/scenarios/` for examples
