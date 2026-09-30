import { redirect } from 'next/navigation';

/** The app starts at the project list; the (app) layout handles sign-in. */
export default function Home() {
  redirect('/projects');
}
