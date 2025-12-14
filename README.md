# 📊 Asset Tracker

> A modern, full-stack web application for tracking and managing investment portfolios with real-time price updates from multiple asset classes.

![Next.js](https://img.shields.io/badge/Next.js-16.0-black?logo=next.js)
![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb)

## 🎯 Overview

Asset Tracker is a comprehensive portfolio management application that enables users to track their investments across multiple asset classes including cryptocurrencies, stocks, precious metals, real estate, and cash. The app integrates with the Alphavantage API to provide real-time market data while implementing intelligent rate limiting and caching strategies.

**Live Demo:** _(Add your deployment URL here)_

## ✨ Key Features

### 💼 Portfolio Management

- **Multi-Asset Support**: Track stocks, cryptocurrencies, precious metals, real estate, and cash holdings
- **Smart Search**: Real-time asset search with auto-complete functionality for stocks and 15+ popular cryptocurrencies
- **Flexible CRUD Operations**: Add, edit, delete, and restore assets with full data persistence
- **Favorites System**: Mark frequently viewed assets for quick access

### 📈 Real-Time Data Integration

- **Alphavantage API Integration**:
  - `SYMBOL_SEARCH` for stock/ETF discovery
  - `GLOBAL_QUOTE` for stock prices
  - `CURRENCY_EXCHANGE_RATE` for cryptocurrency valuations
- **Intelligent Rate Limiting**: Database-backed API call counter (25 calls/day free tier)
- **Price Caching**: MongoDB-based price storage with upsert pattern to prevent duplicates
- **Multi-User Optimization**: Deduplicates API calls across all users to maximize efficiency

### 🎨 Modern UI/UX

- **Responsive Design**: Mobile-first approach using Tailwind CSS
- **Component Library**: Built with shadcn/ui and Radix UI primitives
- **Smart Indicators**:
  - Color-coded API limit badges (green → yellow → red)
  - "Time since update" displays with auto-refresh
  - Loading states and disabled buttons based on API availability
- **Advanced Filtering**: Sort by value, name, or date; filter by asset type; show/hide deleted items

### 🔐 Authentication & Data Security

- **NextAuth.js Integration**: Secure authentication flow
- **User Isolation**: Each user's assets stored separately with proper session management
- **Secure Database**: Cloud-hosted MongoDB with proper indexing and validation

### 🏗️ Technical Architecture

- **Full TypeScript**: 100% TypeScript codebase for type safety
- **API Routes**: RESTful endpoints built with Next.js API routes
- **State Management**: SWR for server state, React hooks for UI state
- **Real-Time Updates**: Polling mechanism for API limit badge (10s interval)

## 🛠️ Tech Stack

### Frontend

- **Framework**: Next.js 16.0.10 (React 19.2.3)
- **Language**: TypeScript 5.9.3
- **Styling**: Tailwind CSS + shadcn/ui components
- **State**: SWR (data fetching), React hooks
- **Icons**: Lucide React
- **Forms**: React Hook Form + Zod validation

### Backend

- **Runtime**: Node.js (Next.js API routes)
- **Database**: MongoDB (Mongoose ODM)
- **Authentication**: NextAuth.js
- **HTTP Client**: Axios
- **External API**: Alphavantage (free tier)

### Developer Experience

- **Type Safety**: Full TypeScript support
- **Linting**: ESLint with Next.js config
- **Code Quality**: Prettier formatting (auto-format on save)

## 📦 Installation

### Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)
- MongoDB database (Atlas or local)
- Alphavantage API key ([Get free key](https://www.alphavantage.co/support/#api-key))

### Setup

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/asset-tracker.git
cd asset-tracker
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Environment Configuration**

Create a `.env.local` file in the root directory:

```env
# MongoDB
MONGODB_URI=your_mongodb_connection_string

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secret_key_here

# Alphavantage
ALPHAVANTAGE_API_KEY=your_api_key_here
```

4. **Run the development server**

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🚀 Production Build

```bash
pnpm build
pnpm start
```

## 📁 Project Structure

```
asset-tracker/
├── src/
│   ├── components/          # React components
│   │   ├── ApiLimitBadge/  # API usage display
│   │   ├── AssetControls/  # Action buttons
│   │   ├── AssetDialog/    # Add/Edit modal
│   │   ├── AssetList/      # Asset grid display
│   │   ├── AssetSearchDialog/ # Alphavantage search
│   │   ├── Filters/        # Sort & filter controls
│   │   ├── Prices/         # Price management UI
│   │   └── ui/             # shadcn/ui primitives
│   ├── db/                 # Database connection & models
│   ├── pages/
│   │   ├── api/            # API routes
│   │   ├── _app.js         # App wrapper
│   │   └── index.js        # Main page
│   └── styles/
│       └── globals.css     # Global styles
├── public/                 # Static assets
└── tailwind.config.js     # Tailwind configuration
```

## 🎯 Key Implementations

### Rate Limiting Architecture

The app implements a sophisticated rate limiting system to maximize the free tier (25 calls/day):

- **Database Counter**: Tracks daily API usage across all users
- **Server-Side Enforcement**: API endpoint checks counter before making calls
- **Multi-User Deduplication**: Fetches all users' assets, removes duplicates, then queries API
- **Real-Time UI Updates**: Badge polls counter every 10s, disables buttons when limit reached
- **Color-Coded Warnings**: Green (>10), Yellow (2-10), Red (≤1 remaining)

### Price Caching Strategy

The app uses MongoDB to cache price data with an upsert pattern to prevent duplicates, ensuring each symbol has exactly one price record that gets updated rather than creating new entries.

### Asset Search Flow

1. User types in search dialog (300ms debounce)
2. Frontend calls API with search query
3. Backend checks hardcoded crypto list (15 symbols)
4. If crypto: returns immediately with EUR exchange data
5. If not crypto: calls Alphavantage `SYMBOL_SEARCH`
6. Results merged and displayed with asset class badges
7. User selects → Asset dialog opens with pre-filled data

## 🔄 Possible future Enhancements

- [ ] Historical price charts (Chart.js integration)
- [ ] Portfolio performance analytics
- [ ] Support for custom asset types
- [ ] Multi-currency display
- [ ] Dark mode
- [ ] PWA support for offline access

⭐ **Star this repo** if you find it helpful!
