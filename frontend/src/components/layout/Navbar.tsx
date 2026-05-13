'use client';

import Link from 'next/link';
import { Menu, X, Download } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 backdrop-blur-md shadow-sm border-b border-gray-200'
          : 'bg-white'
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-xl text-gray-900"
          >
            <Download className="h-6 w-6" />
            <span>FetchClip Pro</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="/" className="text-gray-700 hover:text-black">
              Home
            </Link>

            <Link
              href="/features"
              className="text-gray-700 hover:text-black"
            >
              Features
            </Link>

            <Link href="/faq" className="text-gray-700 hover:text-black">
              FAQ
            </Link>

            <Link href="/contact" className="text-gray-700 hover:text-black">
              Contact
            </Link>
          </nav>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-gray-700"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 py-4">
            <nav className="flex flex-col gap-4">
              <Link href="/" onClick={() => setMobileMenuOpen(false)}>
                Home
              </Link>

              <Link
                href="/features"
                onClick={() => setMobileMenuOpen(false)}
              >
                Features
              </Link>

              <Link href="/faq" onClick={() => setMobileMenuOpen(false)}>
                FAQ
              </Link>

              <Link
                href="/contact"
                onClick={() => setMobileMenuOpen(false)}
              >
                Contact
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}