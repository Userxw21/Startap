import { OrderPriority, OrderStatus } from './enums';
import { GeoPoint } from './geo';

export interface Order {
  id: string;
  companyId: string;
  status: OrderStatus;
  priority: OrderPriority;
  pickupAddress: string;
  pickup: GeoPoint;
  deliveryAddress: string;
  delivery: GeoPoint;
  customerName: string | null;
  customerPhone: string | null;
  assignedCourierId: string | null;
  pickupDeadlineAt: string | null;
  deliveryDeadlineAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
