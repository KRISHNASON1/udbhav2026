import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Multi-page app — lets Vite resolve /404 to 404.html
  appType: 'mpa',

  build: {
    rollupOptions: {
      input: {
        main:       resolve(__dirname, 'index.html'),
        about:      resolve(__dirname, 'about.html'),
        work:       resolve(__dirname, 'work.html'),
        blog:       resolve(__dirname, 'blog.html'),
        blogPost:   resolve(__dirname, 'blog-post.html'),
        links:      resolve(__dirname, 'links.html'),
        uses:       resolve(__dirname, 'uses.html'),
        playground: resolve(__dirname, 'playground.html'),
        jamify:     resolve(__dirname, 'jamify.html'),
        bookACall:  resolve(__dirname, 'book-a-call.html'),
        notFound:   resolve(__dirname, '404.html'),
      },
    },
  },
});
