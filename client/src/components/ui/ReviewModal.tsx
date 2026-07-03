import { useState } from 'react';
import { Modal } from './Modal';
import { StarRating } from './Badges';
import { api } from '../../services/api';
import { useToast } from './Toast';

interface ReviewModalProps {
  open: boolean;
  onClose: () => void;
  revieweeId: string;
  revieweeName: string;
  listingId?: string;
  onSubmitted?: () => void;
}

export function ReviewModal({ open, onClose, revieweeId, revieweeName, listingId, onSubmitted }: ReviewModalProps) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isRecommended, setIsRecommended] = useState(true);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const submit = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await api.post('/reviews', { revieweeId, listingId, rating, comment, isRecommended });
      toast.show('Ocena uspešno poslata!', 'success');
      onSubmitted?.();
      onClose();
      setRating(5);
      setComment('');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Ocenite ${revieweeName}`}>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Ocena</label>
          <StarRating rating={rating} interactive onChange={setRating} size={28} />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Komentar</label>
          <textarea
            className="input min-h-[100px]"
            placeholder="Podelite svoje iskustvo..."
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isRecommended}
            onChange={e => setIsRecommended(e.target.checked)}
            className="rounded border-gray-300 text-brand-600"
          />
          <span className="text-sm">Preporučujem ovog majstora</span>
        </label>
        <button onClick={submit} disabled={loading} className="btn-primary w-full">
          {loading ? 'Slanje...' : 'Pošalji ocenu'}
        </button>
      </div>
    </Modal>
  );
}
