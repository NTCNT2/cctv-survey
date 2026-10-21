import { redirect } from 'next/navigation';
import { HOME_PATH } from '@/lib/form';

/** The app starts at the dashboard; the (app) layout handles sign-in. */
export default function Home() {
  redirect(HOME_PATH);
}
